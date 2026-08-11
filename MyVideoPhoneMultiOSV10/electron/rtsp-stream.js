'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveFfmpegPath } = require('./media-compat');

/** @type {null | {
 *   id: string,
 *   url: string,
 *   process: import('child_process').ChildProcess | null,
 *   clients: Set<import('http').ServerResponse>,
 *   stderr: string,
 *   mode: 'copy' | 'transcode',
 *   startedAt: number,
 *   bytesSent: number
 * }} */
let active = null;

/** @type {null | {
 *   url: string,
 *   outputPath: string,
 *   process: import('child_process').ChildProcess,
 *   stderr: string,
 *   mode: 'copy' | 'transcode',
 *   startedAt: number,
 *   progressTimer: ReturnType<typeof setInterval> | null,
 *   onProgress: null | ((p: object) => void)
 * }} */
let recording = null;

function isRtspUrl(input) {
  return /^rtsps?:\/\//i.test(String(input || '').trim());
}

function normalizeRtspUrl(input) {
  return String(input || '').trim();
}

function buildArgs(rtspUrl, mode) {
  const commonIn = [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    'tcp',
    '-fflags',
    'nobuffer',
    '-flags',
    'low_delay',
    '-i',
    rtspUrl,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?'
  ];

  if (mode === 'transcode') {
    return [
      ...commonIn,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    ];
  }

  return [
    ...commonIn,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  ];
}

function killProcess(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
        windowsHide: true,
        stdio: 'ignore'
      });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, 800);
    }
  } catch {
    /* ignore */
  }
}

function closeClients(session) {
  if (!session) return;
  for (const res of session.clients) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  session.clients.clear();
}

function stopRtspStream() {
  // Keep an in-progress recording running even if preview stream stops.
  if (!active) return { ok: true };
  const session = active;
  active = null;
  killProcess(session.process);
  session.process = null;
  closeClients(session);
  return { ok: true };
}

function buildRecordArgs(rtspUrl, outputPath, mode) {
  const commonIn = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    'tcp',
    '-i',
    rtspUrl,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?'
  ];

  // Fragmented MP4 stays playable after a clean stop ('q') and is safer for live capture.
  const movflags = 'frag_keyframe+empty_moov+default_base_moof';

  if (mode === 'transcode') {
    return [
      ...commonIn,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-ac',
      '2',
      '-f',
      'mp4',
      '-movflags',
      movflags,
      outputPath
    ];
  }

  return [
    ...commonIn,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ac',
    '2',
    '-f',
    'mp4',
    '-movflags',
    movflags,
    outputPath
  ];
}

/** Remux captured fMP4 into a progressive MP4 Chromium plays reliably. */
function remuxToPlayableMp4(inputPath) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size < 1) {
        resolve({ ok: false, path: inputPath });
        return;
      }
    } catch {
      resolve({ ok: false, path: inputPath });
      return;
    }

    const tmpPath = `${inputPath}.playable.mp4`;
    const ffmpeg = resolveFfmpegPath();
    const child = spawn(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
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
          fs.unlinkSync(inputPath);
          fs.renameSync(tmpPath, inputPath);
          resolve({ ok: true, path: inputPath });
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

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getRtspRecording() {
  if (!recording) return null;
  return {
    url: recording.url,
    outputPath: recording.outputPath,
    startedAt: recording.startedAt,
    elapsedMs: Date.now() - recording.startedAt,
    elapsed: formatElapsed(Date.now() - recording.startedAt),
    mode: recording.mode
  };
}

function emitRecordProgress(extra = {}) {
  if (!recording?.onProgress) return;
  recording.onProgress({
    phase: 'recording',
    url: recording.url,
    path: recording.outputPath,
    elapsedMs: Date.now() - recording.startedAt,
    elapsed: formatElapsed(Date.now() - recording.startedAt),
    ...extra
  });
}

function spawnRecordProcess(session) {
  const ffmpeg = resolveFfmpegPath();
  const args = buildRecordArgs(session.url, session.outputPath, session.mode);
  const child = spawn(ffmpeg, args, {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe']
  });
  session.process = child;
  session.stderr = '';

  child.stderr.on('data', (chunk) => {
    session.stderr += String(chunk);
    if (session.stderr.length > 12000) session.stderr = session.stderr.slice(-12000);
  });

  child.on('error', (err) => {
    session.stderr += `\nffmpeg spawn error: ${err.message}`;
  });

  return child;
}

/**
 * Start recording an RTSP URL to an MP4 file.
 * Call stopRtspRecord() to finalize (sends 'q' for a clean MP4).
 */
function startRtspRecord(rawUrl, outputPath, onProgress) {
  const url = normalizeRtspUrl(rawUrl);
  if (!isRtspUrl(url)) {
    return { ok: false, error: 'Invalid RTSP URL (expected rtsp:// or rtsps://)' };
  }
  if (!outputPath || typeof outputPath !== 'string') {
    return { ok: false, error: 'Output path is required' };
  }
  if (recording) {
    return { ok: false, error: 'RTSP recording is already in progress', recording: getRtspRecording() };
  }

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } catch {
    /* parent may already exist */
  }

  const session = {
    url,
    outputPath,
    process: null,
    stderr: '',
    mode: 'copy',
    startedAt: Date.now(),
    progressTimer: null,
    manualStop: false,
    onProgress: typeof onProgress === 'function' ? onProgress : null
  };

  recording = session;
  const child = spawnRecordProcess(session);

  child.on('close', (code) => {
    // stopRtspRecord() owns completion when the user presses Stop.
    if (session.manualStop) return;
    if (recording !== session) return;

    const earlyFail =
      code !== 0 &&
      Date.now() - session.startedAt < 8000 &&
      session.mode === 'copy' &&
      (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 4096);

    if (earlyFail) {
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {
        /* ignore */
      }
      session.mode = 'transcode';
      session.startedAt = Date.now();
      const retry = spawnRecordProcess(session);
      retry.on('close', (retryCode) => {
        if (recording !== session) return;
        const pathReady = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
        if (session.progressTimer) clearInterval(session.progressTimer);
        recording = null;
        session.onProgress?.({
          phase: retryCode === 0 || pathReady ? 'done' : 'error',
          path: outputPath,
          error: retryCode === 0 || pathReady ? undefined : session.stderr.trim() || `ffmpeg exit ${retryCode}`
        });
      });
      return;
    }

    if (session.progressTimer) clearInterval(session.progressTimer);
    const pathReady = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
    recording = null;
    session.onProgress?.({
      phase: code === 0 || pathReady ? 'done' : 'error',
      path: outputPath,
      elapsedMs: Date.now() - session.startedAt,
      elapsed: formatElapsed(Date.now() - session.startedAt),
      error: code === 0 || pathReady ? undefined : session.stderr.trim() || `ffmpeg exit ${code}`
    });
  });

  session.progressTimer = setInterval(() => emitRecordProgress(), 1000);
  emitRecordProgress({ phase: 'started' });

  return {
    ok: true,
    url,
    path: outputPath,
    startedAt: session.startedAt
  };
}

function stopRtspRecord(options = {}) {
  const discard = Boolean(options.discard);
  if (!recording) {
    return Promise.resolve({ ok: false, error: 'No RTSP recording in progress' });
  }

  const session = recording;
  const child = session.process;
  const outputPath = session.outputPath;
  const startedAt = session.startedAt;
  session.manualStop = true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (session.progressTimer) clearInterval(session.progressTimer);
      if (recording === session) recording = null;
      if (discard && outputPath) {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {
          /* ignore */
        }
        resolve({
          ok: true,
          cancelled: true,
          elapsedMs: Date.now() - startedAt,
          elapsed: formatElapsed(Date.now() - startedAt)
        });
        return;
      }

      // Finalize into a progressive MP4 so the player can open it immediately.
      if (result.ok && outputPath) {
        const remuxed = await remuxToPlayableMp4(outputPath);
        result.path = remuxed.path;
        result.ok = remuxed.ok || result.ok;
        try {
          result.size = fs.existsSync(result.path) ? fs.statSync(result.path).size : 0;
          result.name = path.basename(result.path);
        } catch {
          result.size = 0;
          result.name = path.basename(result.path || '');
        }
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      killProcess(child);
      const pathReady = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
      void finish({
        ok: pathReady,
        path: outputPath,
        elapsedMs: Date.now() - startedAt,
        elapsed: formatElapsed(Date.now() - startedAt),
        error: pathReady ? undefined : session.stderr.trim() || 'Recording stop timed out'
      });
    }, 12000);

    if (!child) {
      clearTimeout(timer);
      void finish({
        ok: false,
        path: outputPath,
        elapsedMs: Date.now() - startedAt,
        elapsed: formatElapsed(Date.now() - startedAt),
        error: 'Recording process missing'
      });
      return;
    }

    child.once('close', (code) => {
      clearTimeout(timer);
      const pathReady = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
      void finish({
        ok: pathReady || code === 0,
        path: outputPath,
        elapsedMs: Date.now() - startedAt,
        elapsed: formatElapsed(Date.now() - startedAt),
        error: pathReady || code === 0 ? undefined : session.stderr.trim() || `ffmpeg exit ${code}`
      });
    });

    try {
      if (discard) {
        killProcess(child);
      } else if (child.stdin && !child.stdin.destroyed) {
        // Graceful quit so MP4 atoms are finalized.
        child.stdin.write('q');
        child.stdin.end();
      } else {
        killProcess(child);
      }
    } catch {
      killProcess(child);
    }

    emitRecordProgress({ phase: discard ? 'cancelled' : 'stopping' });
  });
}

function getActiveRtsp() {
  if (!active) return null;
  return { id: active.id, url: active.url, mode: active.mode };
}

function openRtspStream(rawUrl) {
  const url = normalizeRtspUrl(rawUrl);
  if (!isRtspUrl(url)) {
    return { ok: false, error: 'Invalid RTSP URL (expected rtsp:// or rtsps://)' };
  }

  stopRtspStream();

  const id = crypto.randomBytes(8).toString('hex');
  active = {
    id,
    url,
    process: null,
    clients: new Set(),
    stderr: '',
    mode: 'copy',
    startedAt: 0,
    bytesSent: 0
  };

  return {
    ok: true,
    id,
    url,
    path: `/__rtsp/${id}`,
    name: url
  };
}

function spawnFfmpeg(session) {
  if (!session || session.process) return;

  const ffmpeg = resolveFfmpegPath();
  const args = buildArgs(session.url, session.mode);
  const child = spawn(ffmpeg, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  session.process = child;
  session.startedAt = Date.now();
  session.stderr = '';
  session.bytesSent = 0;

  child.stdout.on('data', (chunk) => {
    if (!active || active.id !== session.id) return;
    session.bytesSent += chunk.length;
    for (const res of session.clients) {
      try {
        res.write(chunk);
      } catch {
        session.clients.delete(res);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    session.stderr += String(chunk);
    if (session.stderr.length > 12000) session.stderr = session.stderr.slice(-12000);
  });

  child.on('error', (err) => {
    session.stderr += `\nffmpeg spawn error: ${err.message}`;
  });

  child.on('close', () => {
    if (!active || active.id !== session.id) return;
    session.process = null;

    const earlyFail = session.bytesSent < 4096 && Date.now() - session.startedAt < 8000;
    if (earlyFail && session.mode === 'copy' && session.clients.size > 0) {
      session.mode = 'transcode';
      spawnFfmpeg(session);
      return;
    }

    closeClients(session);
  });
}

/**
 * Serve live fMP4 from the active RTSP ffmpeg pipe.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} streamId
 */
function serveRtspHttp(req, res, streamId) {
  if (!active || active.id !== streamId) {
    res.writeHead(404);
    res.end('RTSP stream not found');
    return;
  }

  const session = active;

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  session.clients.add(res);
  spawnFfmpeg(session);

  const cleanup = () => {
    session.clients.delete(res);
    try {
      if (!res.writableEnded) res.end();
    } catch {
      /* ignore */
    }
  };

  req.on('close', cleanup);
  res.on('error', cleanup);
}

module.exports = {
  isRtspUrl,
  normalizeRtspUrl,
  openRtspStream,
  stopRtspStream,
  getActiveRtsp,
  serveRtspHttp,
  startRtspRecord,
  stopRtspRecord,
  getRtspRecording
};

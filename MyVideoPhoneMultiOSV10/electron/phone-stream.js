'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const { resolveFfmpegPath } = require('./media-compat');

/** Fixed LAN phone port — users connect with IP only; no settings UI. */
const PHONE_PORT = 8765;
const RING_TIMEOUT_MS = 45000;

/** @type {import('http').Server | null} */
let server = null;
/** @type {number} */
let listenPort = 0;
/** @type {boolean} */
let publishEnabled = true;

/** @type {null | ((info: object) => void)} */
let incomingCallHandler = null;

/** @type {Map<string, {
 *   callId: string,
 *   fromIp: string,
 *   fromLabel: string,
 *   resolve: (result: object) => void,
 *   timer: ReturnType<typeof setTimeout>
 * }>} */
const pendingCalls = new Map();

/** Tokens granted after Accept — required for remote /live access. */
/** @type {Map<string, { fromIp: string, expires: number }>} */
const acceptedTokens = new Map();

/** While dialing a peer, allow that peer to pull our /live without a second ring. */
/** @type {Map<string, number>} ip -> expires */
const callbackAllowIps = new Map();

/** @type {null | {
 *   process: import('child_process').ChildProcess | null,
 *   clients: Set<import('http').ServerResponse>,
 *   initBuffer: Buffer,
 *   stderr: string,
 *   startedAt: number
 * }} */
let session = null;

/** @type {string[] | null} */
let cachedDeviceInputArgs = null;

function getPhonePort() {
  return listenPort || PHONE_PORT;
}

function getLanIpv4Addresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets || {})) {
    for (const net of entries || []) {
      const family = net.family === 'IPv4' || net.family === 4;
      if (family && !net.internal && net.address) out.push(net.address);
    }
  }
  return out;
}

function normalizeRemoteIp(addr) {
  if (!addr) return '';
  const s = String(addr);
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s;
}

function isLoopbackIp(ip) {
  const n = normalizeRemoteIp(ip);
  return n === '127.0.0.1' || n === '::1' || n === 'localhost';
}

function setIncomingCallHandler(handler) {
  incomingCallHandler = typeof handler === 'function' ? handler : null;
}

function pruneAcceptedTokens() {
  const now = Date.now();
  for (const [token, meta] of acceptedTokens) {
    if (!meta || meta.expires < now) acceptedTokens.delete(token);
  }
}

function clearAcceptedSessions() {
  acceptedTokens.clear();
  callbackAllowIps.clear();
}

function allowCallbackFrom(ip, ttlMs = 120000) {
  const n = normalizeRemoteIp(ip);
  if (!n || isLoopbackIp(n)) return { ok: false };
  callbackAllowIps.set(n, Date.now() + Math.max(5000, ttlMs));
  return { ok: true, ip: n };
}

function pruneCallbackAllows() {
  const now = Date.now();
  for (const [ip, expires] of callbackAllowIps) {
    if (!expires || expires < now) callbackAllowIps.delete(ip);
  }
}

function respondToCall(callId, accepted) {
  const pending = pendingCalls.get(String(callId || ''));
  if (!pending) return { ok: false, error: 'Call not found' };
  clearTimeout(pending.timer);
  pendingCalls.delete(pending.callId);

  let token = '';
  if (accepted) {
    pruneAcceptedTokens();
    token = crypto.randomBytes(16).toString('hex');
    acceptedTokens.set(token, {
      fromIp: pending.fromIp,
      expires: Date.now() + 2 * 60 * 60 * 1000
    });
  }

  pending.resolve({
    ok: true,
    accepted: Boolean(accepted),
    token,
    livePath: token ? `/live?token=${token}` : ''
  });
  return { ok: true, accepted: Boolean(accepted) };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        try {
          req.destroy();
        } catch {
          /* ignore */
        }
        resolve({});
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function writeCorsJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
}

/**
 * Peer dials with POST /ring. Holds until Accept / Reject / timeout.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleRingRequest(req, res) {
  if (!publishEnabled) {
    writeCorsJson(res, 503, { ok: false, accepted: false, error: 'unavailable' });
    return;
  }
  if (pendingCalls.size > 0) {
    writeCorsJson(res, 409, { ok: false, accepted: false, error: 'busy' });
    return;
  }

  const body = await readJsonBody(req);
  const fromIp = normalizeRemoteIp(req.socket?.remoteAddress);
  const fromLabel = String(body?.from || body?.label || fromIp || 'unknown').trim() || fromIp;
  const callId = crypto.randomBytes(8).toString('hex');

  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pendingCalls.has(callId)) return;
      pendingCalls.delete(callId);
      resolve({ ok: true, accepted: false, error: 'timeout', token: '', livePath: '' });
    }, RING_TIMEOUT_MS);

    pendingCalls.set(callId, {
      callId,
      fromIp,
      fromLabel,
      resolve,
      timer
    });

    try {
      incomingCallHandler?.({
        callId,
        fromIp,
        fromLabel,
        timeoutMs: RING_TIMEOUT_MS
      });
    } catch {
      /* ignore UI errors — call still waits for respondToCall / timeout */
    }
  });

  writeCorsJson(res, 200, result);
}

function canAccessLive(req, reqUrl) {
  const remote = normalizeRemoteIp(req.socket?.remoteAddress);
  if (isLoopbackIp(remote)) return true;
  pruneAcceptedTokens();
  pruneCallbackAllows();
  const token = reqUrl.searchParams.get('token') || '';
  if (token && acceptedTokens.has(token)) return true;
  const allowUntil = callbackAllowIps.get(remote);
  if (allowUntil && allowUntil > Date.now()) return true;
  return false;
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

function closeClients() {
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

function stopPublisher() {
  if (!session) return;
  killProcess(session.process);
  session.process = null;
  closeClients();
  session = null;
}

function listDevicesStderr() {
  const ffmpeg = resolveFfmpegPath();
  return new Promise((resolve) => {
    const args =
      process.platform === 'win32'
        ? ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']
        : process.platform === 'darwin'
          ? ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']
          : ['-hide_banner', '-f', 'v4l2', '-list_devices', 'true', '-i', ''];
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => {
      stderr += String(c);
    });
    child.on('close', () => resolve(stderr));
    child.on('error', () => resolve(stderr));
    setTimeout(() => {
      try {
        killProcess(child);
      } catch {
        /* ignore */
      }
      resolve(stderr);
    }, 4000);
  });
}

async function resolveCameraInputArgs() {
  if (cachedDeviceInputArgs) return cachedDeviceInputArgs;

  if (process.platform === 'win32') {
    const stderr = await listDevicesStderr();
    const videoSection = stderr.split(/DirectShow audio devices/i)[0] || stderr;
    const match = videoSection.match(/"([^"]+)"\s*(?:\(video\))?/i);
    const name = match?.[1] || '';
    if (!name) {
      cachedDeviceInputArgs = ['-f', 'dshow', '-i', 'video=0'];
    } else {
      cachedDeviceInputArgs = ['-f', 'dshow', '-i', `video=${name}`];
    }
  } else if (process.platform === 'darwin') {
    cachedDeviceInputArgs = ['-f', 'avfoundation', '-framerate', '30', '-i', '0:none'];
  } else {
    cachedDeviceInputArgs = ['-f', 'v4l2', '-framerate', '30', '-i', '/dev/video0'];
  }

  return cachedDeviceInputArgs;
}

function buildPublishArgs(inputArgs) {
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    ...inputArgs,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '30',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  ];
}

async function ensurePublisher() {
  if (!publishEnabled) return false;
  if (session?.process) return true;

  const inputArgs = await resolveCameraInputArgs();
  const ffmpeg = resolveFfmpegPath();
  const args = buildPublishArgs(inputArgs);

  session = {
    process: null,
    clients: session?.clients || new Set(),
    initBuffer: Buffer.alloc(0),
    stderr: '',
    startedAt: Date.now()
  };

  const child = spawn(ffmpeg, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  session.process = child;

  child.stdout.on('data', (chunk) => {
    if (!session || session.process !== child) return;
    if (session.initBuffer.length < 256 * 1024) {
      session.initBuffer = Buffer.concat([session.initBuffer, chunk]);
    }
    for (const res of session.clients) {
      try {
        res.write(chunk);
      } catch {
        session.clients.delete(res);
      }
    }
    if (session.clients.size === 0) {
      // Keep publisher warm briefly while local preview reconnects.
    }
  });

  child.stderr.on('data', (chunk) => {
    if (!session) return;
    session.stderr += String(chunk);
    if (session.stderr.length > 12000) session.stderr = session.stderr.slice(-12000);
  });

  child.on('error', (err) => {
    if (!session) return;
    session.stderr += `\nffmpeg spawn error: ${err.message}`;
  });

  child.on('close', () => {
    if (!session || session.process !== child) return;
    session.process = null;
    closeClients();
  });

  return true;
}

async function servePhoneLive(req, res) {
  if (!publishEnabled) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Camera is off');
    return;
  }

  const host = `http://127.0.0.1:${listenPort || PHONE_PORT}`;
  const reqUrl = new URL(req.url || '/live', host);
  if (!canAccessLive(req, reqUrl)) {
    res.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end('Call not accepted');
    return;
  }

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

  if (!session) {
    session = {
      process: null,
      clients: new Set(),
      initBuffer: Buffer.alloc(0),
      stderr: '',
      startedAt: Date.now()
    };
  }

  if (session.initBuffer.length > 0) {
    try {
      res.write(session.initBuffer);
    } catch {
      res.end();
      return;
    }
  }

  session.clients.add(res);
  await ensurePublisher();

  const cleanup = () => {
    if (!session) return;
    session.clients.delete(res);
    try {
      if (!res.writableEnded) res.end();
    } catch {
      /* ignore */
    }
    // Stop capture when nobody is watching (saves camera / LED).
    if (session.clients.size === 0) {
      const idle = session;
      setTimeout(() => {
        if (session === idle && session.clients.size === 0) {
          stopPublisher();
        }
      }, 1500);
    }
  };

  req.on('close', cleanup);
  res.on('error', cleanup);
}

function setPhonePublishEnabled(enabled) {
  publishEnabled = Boolean(enabled);
  if (!publishEnabled) stopPublisher();
  return { ok: true, enabled: publishEnabled };
}

function isPhonePublishEnabled() {
  return publishEnabled;
}

function listenOnce(httpServer, port, host) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      httpServer.off('error', onError);
      resolve(httpServer.address().port);
    };
    const onError = (err) => {
      httpServer.off('listening', onListening);
      reject(err);
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, host);
  });
}

async function startPhoneServer() {
  if (server) {
    return {
      ok: true,
      port: listenPort,
      lanAddresses: getLanIpv4Addresses()
    };
  }

  server = http.createServer((req, res) => {
    try {
      const host = `http://127.0.0.1:${listenPort || PHONE_PORT}`;
      const reqUrl = new URL(req.url || '/', host);
      const pathname = decodeURIComponent(reqUrl.pathname);

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
      }

      if (pathname === '/ring' && req.method === 'POST') {
        void handleRingRequest(req, res);
        return;
      }

      if (pathname === '/live' || pathname === '/__phone/live') {
        void servePhoneLive(req, res);
        return;
      }
      if (pathname === '/status') {
        writeCorsJson(res, 200, {
          ok: true,
          app: 'MyVideoPhone',
          publish: publishEnabled,
          port: listenPort || PHONE_PORT,
          pending: pendingCalls.size > 0
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.message || err));
    }
  });

  const hosts = ['0.0.0.0'];
  let port = PHONE_PORT;
  let lastErr = null;
  for (let i = 0; i < 10; i += 1) {
    try {
      listenPort = await listenOnce(server, port + i, hosts[0]);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (err?.code !== 'EADDRINUSE') break;
    }
  }
  if (lastErr && !listenPort) {
    server = null;
    throw lastErr;
  }

  return {
    ok: true,
    port: listenPort,
    lanAddresses: getLanIpv4Addresses()
  };
}

function stopPhoneServer() {
  for (const pending of pendingCalls.values()) {
    clearTimeout(pending.timer);
    try {
      pending.resolve({ ok: false, accepted: false, error: 'stopped', token: '', livePath: '' });
    } catch {
      /* ignore */
    }
  }
  pendingCalls.clear();
  clearAcceptedSessions();
  stopPublisher();
  try {
    server?.close();
  } catch {
    /* ignore */
  }
  server = null;
  listenPort = 0;
  return { ok: true };
}

function getPhoneInfo() {
  const port = getPhonePort();
  const lanAddresses = getLanIpv4Addresses();
  return {
    port,
    defaultPort: PHONE_PORT,
    publishEnabled,
    lanAddresses,
    localLiveUrl: port ? `http://127.0.0.1:${port}/live` : '',
    /** Address peers should type — IP only when using the default port. */
    peerHints: lanAddresses.map((ip) => (port === PHONE_PORT ? ip : `${ip}:${port}`))
  };
}

module.exports = {
  PHONE_PORT,
  RING_TIMEOUT_MS,
  startPhoneServer,
  stopPhoneServer,
  setPhonePublishEnabled,
  isPhonePublishEnabled,
  getPhoneInfo,
  getLanIpv4Addresses,
  getPhonePort,
  setIncomingCallHandler,
  respondToCall,
  clearAcceptedSessions,
  allowCallbackFrom
};

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
/** @type {null | ((info: object) => void)} */
let peerDisconnectHandler = null;
/** @type {Map<import('http').ServerResponse, {
 *   remoteIp: string,
 *   isRemote: boolean,
 *   localClose: boolean,
 *   initSent: boolean
 * }>} */
const clientMeta = new Map();

/** Serialize publisher restart / spawn so call join stays deterministic. */
let publisherGate = Promise.resolve();

function withPublisherGate(fn) {
  const run = publisherGate.then(fn, fn);
  publisherGate = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

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

/** Explicit LAN call flag for /status probes (peer hang-up detection). */
let lanCallActive = false;

/** Outgoing mic into the phone publish path (ffmpeg). */
let micPublishEnabled = true;
let micVolumePercent = 100;

/** @type {null | {
 *   process: import('child_process').ChildProcess | null,
 *   clients: Set<import('http').ServerResponse>,
 *   initSegment: Buffer,
 *   initReady: boolean,
 *   parseBuf: Buffer,
 *   stderr: string,
 *   startedAt: number
 * }} */
let session = null;

/**
 * Pull complete ftyp+moov boxes from the head of an fMP4 byte stream.
 * Later moof/mdat (past video) must not be replayed to late joiners.
 * @param {Buffer} buffer
 * @returns {{ done: boolean, init: Buffer | null, rest: Buffer }}
 */
function consumeFmp4Init(buffer) {
  let offset = 0;
  let hasFtyp = false;
  let hasMoov = false;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    if (!Number.isFinite(size) || size < 8) {
      return { done: false, init: null, rest: buffer };
    }
    if (offset + size > buffer.length) break;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    offset += size;
    if (type === 'ftyp') hasFtyp = true;
    if (type === 'moov') hasMoov = true;
    if (hasFtyp && hasMoov) {
      return {
        done: true,
        init: buffer.subarray(0, offset),
        rest: buffer.subarray(offset)
      };
    }
  }
  return { done: false, init: null, rest: buffer };
}

function createEmptySession(clients = new Set()) {
  return {
    process: null,
    clients,
    initSegment: Buffer.alloc(0),
    initReady: false,
    parseBuf: Buffer.alloc(0),
    stderr: '',
    startedAt: Date.now()
  };
}

function writeInitToClient(res) {
  if (!session?.initReady || !session.initSegment?.length) return false;
  const meta = clientMeta.get(res);
  if (!meta || meta.initSent) return Boolean(meta?.initSent);
  try {
    res.write(session.initSegment);
    meta.initSent = true;
    return true;
  } catch {
    session.clients.delete(res);
    clientMeta.delete(res);
    return false;
  }
}

function writeInitToAllClients() {
  if (!session) return;
  for (const res of [...session.clients]) {
    writeInitToClient(res);
  }
}

function writeLiveToClients(data) {
  if (!session || !data?.length) return;
  for (const res of [...session.clients]) {
    const meta = clientMeta.get(res);
    // Never send media before ftyp/moov — avoids “past” decode from a warm encoder.
    if (!meta?.initSent) {
      if (!writeInitToClient(res)) continue;
    }
    try {
      res.write(data);
    } catch {
      session.clients.delete(res);
      clientMeta.delete(res);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPublisherInit(timeoutMs = 6000) {
  const start = Date.now();
  while (session && !session.initReady && Date.now() - start < timeoutMs) {
    await sleep(40);
  }
  return Boolean(session?.initReady);
}

/**
 * Start a brand-new camera encode at call-connect time.
 * Warm preview publishers must not feed “old” timeline into a peer call.
 */
async function prepareFreshPublisherForCall() {
  if (!session) session = createEmptySession();
  closeClients({ localClose: true });
  if (session.process) {
    const old = session.process;
    session.process = null;
    killProcess(old);
  }
  session.initReady = false;
  session.initSegment = Buffer.alloc(0);
  session.parseBuf = Buffer.alloc(0);
  session.stderr = '';
  session.startedAt = Date.now();
}

/** @type {string[] | null} */
let cachedDeviceInputArgs = null;
/** Whether the resolved capture graph includes a microphone. */
let publishHasAudioInput = false;

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

function setPeerDisconnectHandler(handler) {
  peerDisconnectHandler = typeof handler === 'function' ? handler : null;
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const viewerLeftDebounce = new Map();

function clearViewerLeftDebounce(ip) {
  const n = normalizeRemoteIp(ip);
  if (!n) return;
  const t = viewerLeftDebounce.get(n);
  if (t) {
    clearTimeout(t);
    viewerLeftDebounce.delete(n);
  }
}

function notifyPeerViewerLeft(info) {
  const reason = String(info?.reason || '');
  const fromIp = normalizeRemoteIp(info?.fromIp);

  // Explicit hang-up must end the call immediately.
  if (reason === 'bye') {
    if (fromIp) clearViewerLeftDebounce(fromIp);
    try {
      peerDisconnectHandler?.(info || {});
    } catch {
      /* ignore UI errors */
    }
    return;
  }

  // Mic mute restarts the publisher; the peer briefly drops /live and reconnects.
  // Debounce so a short reconnect is not treated as “peer left”.
  if (fromIp) {
    clearViewerLeftDebounce(fromIp);
    const timer = setTimeout(() => {
      viewerLeftDebounce.delete(fromIp);
      for (const meta of clientMeta.values()) {
        if (meta?.isRemote && normalizeRemoteIp(meta.remoteIp) === fromIp) return;
      }
      try {
        peerDisconnectHandler?.(info || {});
      } catch {
        /* ignore UI errors */
      }
    }, 2800);
    viewerLeftDebounce.set(fromIp, timer);
    return;
  }

  try {
    peerDisconnectHandler?.(info || {});
  } catch {
    /* ignore UI errors */
  }
}

function pruneAcceptedTokens() {
  const now = Date.now();
  for (const [token, meta] of acceptedTokens) {
    if (!meta || meta.expires < now) acceptedTokens.delete(token);
  }
}

function setLanCallActive(active) {
  // Flag only — do not wipe peer IPs here. Hang-up must read them to send /bye first.
  lanCallActive = Boolean(active);
  return { ok: true, active: lanCallActive };
}

function isLanCallActive() {
  return Boolean(lanCallActive);
}

/** IPs of the other party in the current call (caller and/or viewers). */
function getCallPeerIps() {
  pruneAcceptedTokens();
  pruneCallbackAllows();
  const peers = new Set();
  for (const ip of callbackAllowIps.keys()) {
    const n = normalizeRemoteIp(ip);
    if (n && !isLoopbackIp(n)) peers.add(n);
  }
  for (const meta of acceptedTokens.values()) {
    const n = normalizeRemoteIp(meta?.fromIp);
    if (n && !isLoopbackIp(n)) peers.add(n);
  }
  for (const meta of clientMeta.values()) {
    if (!meta?.isRemote) continue;
    const n = normalizeRemoteIp(meta.remoteIp);
    if (n && !isLoopbackIp(n)) peers.add(n);
  }
  return [...peers];
}

function clearAcceptedSessions() {
  lanCallActive = false;
  acceptedTokens.clear();
  callbackAllowIps.clear();
  // Drop active /live viewers so Hang up ends the call for the peer immediately.
  // Mark localClose so our own hang-up does not look like the peer left.
  closeClients({ localClose: true });
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
    lanCallActive = true;
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

function closeClients({ localClose = false } = {}) {
  if (!session) return;
  for (const res of [...session.clients]) {
    const meta = clientMeta.get(res);
    if (meta) meta.localClose = Boolean(localClose) || meta.localClose;
    else if (localClose) {
      clientMeta.set(res, { remoteIp: '', isRemote: false, localClose: true, initSent: true });
    }
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
  closeClients({ localClose: true });
  session = null;
  clientMeta.clear();
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
    const audioSection = stderr.split(/DirectShow audio devices/i)[1] || '';
    const vMatch = videoSection.match(/"([^"]+)"\s*(?:\(video\))?/i);
    const aMatch = audioSection.match(/"([^"]+)"/);
    const cam = vMatch?.[1] ? `video=${vMatch[1]}` : 'video=0';
    const mic = aMatch?.[1] ? `audio=${aMatch[1]}` : '';
    const device = mic ? `${cam}:${mic}` : cam;
    publishHasAudioInput = Boolean(mic);
    cachedDeviceInputArgs = ['-f', 'dshow', '-framerate', '30', '-i', device];
  } else if (process.platform === 'darwin') {
    // 0:0 = first video + first audio.
    publishHasAudioInput = true;
    cachedDeviceInputArgs = ['-f', 'avfoundation', '-framerate', '30', '-i', '0:0'];
  } else {
    publishHasAudioInput = false;
    cachedDeviceInputArgs = ['-f', 'v4l2', '-framerate', '30', '-i', '/dev/video0'];
  }

  return cachedDeviceInputArgs;
}

function micLinearGain() {
  if (!micPublishEnabled) return 0;
  const pct = Math.min(100, Math.max(0, Number(micVolumePercent) || 0));
  return pct / 100;
}

function buildPublishArgs(inputArgs) {
  // Low-latency live fMP4: short GOP, no B-frames, flush every packet.
  // Call join restarts the encoder so media timeline begins at connect time.
  // Keep an AAC track whenever a mic device exists — mute uses volume=0 so the
  // stream codecs stay stable (toggling -an would break the peer MSE session).
  const gain = micLinearGain();
  const audioArgs = publishHasAudioInput
    ? ['-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-ar', '16000', '-af', `volume=${gain.toFixed(3)}`]
    : ['-an'];

  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-fflags',
    'nobuffer+flush_packets',
    '-flags',
    'low_delay',
    '-probesize',
    '32k',
    '-analyzeduration',
    '0',
    ...inputArgs,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-g',
    '15',
    '-keyint_min',
    '15',
    '-bf',
    '0',
    '-force_key_frames',
    'expr:gte(t,n_forced*0.5)',
    '-x264-params',
    'scenecut=0:bframes=0:force-cfr=1',
    ...audioArgs,
    '-f',
    'mp4',
    // CMAF-friendly fMP4 for Chromium MSE (sequence mode).
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset',
    '-frag_duration',
    '500000',
    '-flush_packets',
    '1',
    '-muxdelay',
    '0',
    '-muxpreload',
    '0',
    'pipe:1'
  ];
}

/**
 * Update mic publish settings. Restarts publisher if live so volume applies.
 * Soft-restart keeps /live HTTP clients open (mic mute must not end the call).
 * @param {{ enabled?: boolean, volume?: number, restart?: boolean }} [opts]
 */
function setPhoneMic(opts = {}) {
  if (opts.enabled != null) micPublishEnabled = Boolean(opts.enabled);
  if (opts.volume != null) {
    const n = Math.round(Number(opts.volume));
    if (Number.isFinite(n)) micVolumePercent = Math.min(100, Math.max(0, n));
  }
  const shouldRestart = opts.restart !== false && Boolean(session?.process);
  if (shouldRestart) {
    const clients = session.clients;
    const oldProc = session.process;
    session.process = null;
    session.initReady = false;
    session.initSegment = Buffer.alloc(0);
    session.parseBuf = Buffer.alloc(0);
    for (const meta of clientMeta.values()) {
      if (meta) meta.initSent = false;
    }
    session.clients = clients;
    try {
      killProcess(oldProc);
    } catch {
      /* ignore */
    }
    void ensurePublisher();
  }
  return {
    ok: true,
    enabled: micPublishEnabled,
    volume: micVolumePercent
  };
}

async function ensurePublisher() {
  if (!publishEnabled) return false;
  if (session?.process) return true;

  const inputArgs = await resolveCameraInputArgs();
  const ffmpeg = resolveFfmpegPath();
  const args = buildPublishArgs(inputArgs);

  const clients = session?.clients || new Set();
  session = createEmptySession(clients);

  const child = spawn(ffmpeg, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  session.process = child;

  child.stdout.on('data', (chunk) => {
    if (!session || session.process !== child) return;

    let live = chunk;
    if (!session.initReady) {
      session.parseBuf = Buffer.concat([session.parseBuf, chunk]);
      // Cap parse buffer if camera/ffmpeg never emits moov (avoid RAM blow-up).
      if (session.parseBuf.length > 512 * 1024) {
        session.stderr += '\nfMP4 init (ftyp/moov) not found in first 512KB';
        session.parseBuf = session.parseBuf.subarray(session.parseBuf.length - 64 * 1024);
        return;
      }
      const parsed = consumeFmp4Init(session.parseBuf);
      if (!parsed.done || !parsed.init) return;
      session.initSegment = Buffer.from(parsed.init);
      session.initReady = true;
      session.parseBuf = Buffer.alloc(0);
      writeInitToAllClients();
      live = parsed.rest;
    }

    // Broadcast only the live edge — never retain moof/mdat for replay.
    writeLiveToClients(live);
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
    // Soft mic restart nulls process / swaps child first — keep /live clients.
    if (!session || session.process !== child) return;
    session.process = null;
    closeClients({ localClose: true });
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

  const remoteIp = normalizeRemoteIp(req.socket?.remoteAddress);
  const isRemote = Boolean(remoteIp) && !isLoopbackIp(remoteIp);

  await withPublisherGate(async () => {
    if (!session) {
      session = createEmptySession();
    }

    // Peer call: restart encode at connect so the timeline is “now”, not a warm preview.
    if (isRemote) {
      await prepareFreshPublisherForCall();
    }

    if (isRemote && remoteIp) clearViewerLeftDebounce(remoteIp);

    clientMeta.set(res, {
      remoteIp,
      isRemote,
      localClose: false,
      initSent: false
    });
    session.clients.add(res);

    // Attach cleanup before awaiting publisher so abort during start is handled.
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      const meta = clientMeta.get(res);
      clientMeta.delete(res);
      if (!session) return;
      session.clients.delete(res);
      try {
        if (!res.writableEnded) res.end();
      } catch {
        /* ignore */
      }
      if (meta?.isRemote && !meta.localClose) {
        notifyPeerViewerLeft({ reason: 'viewer-left', fromIp: meta.remoteIp || '' });
      }
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
    res.on('close', cleanup);
    res.on('error', cleanup);

    await ensurePublisher();
    const ready = await waitForPublisherInit(6000);
    if (!ready) {
      cleanup();
      try {
        if (!res.writableEnded) res.end();
      } catch {
        /* ignore */
      }
      return;
    }

    writeInitToClient(res);
  });
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

      // Peer hang-up signal — always end the local call UI.
      if (pathname === '/bye' && req.method === 'POST') {
        void (async () => {
          await readJsonBody(req);
          const fromIp = normalizeRemoteIp(req.socket?.remoteAddress);
          lanCallActive = false;
          writeCorsJson(res, 200, { ok: true });
          notifyPeerViewerLeft({ reason: 'bye', fromIp });
        })();
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
          pending: pendingCalls.size > 0,
          // Only the explicit call flag — avoids false “in call” from warm tokens.
          inCall: Boolean(lanCallActive)
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

  // Warm the camera device resolution now (up to ~4s of dshow enumeration on
  // Windows) so it is cached before the first /live call — keeps the cold-start
  // publisher off the peer's start-timeout critical path.
  if (publishEnabled) {
    void resolveCameraInputArgs().catch(() => {
      /* enumeration is best-effort; ensurePublisher will retry lazily */
    });
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
  setPeerDisconnectHandler,
  respondToCall,
  clearAcceptedSessions,
  allowCallbackFrom,
  setLanCallActive,
  isLanCallActive,
  getCallPeerIps,
  setPhoneMic
};

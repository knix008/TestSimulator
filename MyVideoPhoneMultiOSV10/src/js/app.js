import {
  loadSettings,
  saveSettings,
  resetSettings,
  normalizeVideoFit,
  normalizeRecentCalls,
  MAX_RECENT_CALLS
} from './settings.js';
import { initTooltips } from './tooltip.js';
import {
  BUILTIN_THEMES,
  BUILTIN_THEME_NAME_KEYS,
  THEME_EDIT_KEYS,
  applyThemeToDocument,
  syncThemeToOverlays,
  getThemeDefinition,
  loadCustomThemes,
  upsertCustomTheme,
  deleteCustomTheme,
  createThemeId,
  cloneVarsFromTheme,
  ensureDerivedVars
} from './themes.js';
import { t, setLocale, applyI18n, resolveInitialLocale } from './i18n.js';
import { createErrorDialogController, mediaErrorDetail } from './error-dialog.js';
import { isEditableTarget, isModalOpen } from './hotkeys.js';
import { createLiveMsePlayer } from './live-mse.js';

const isElectron = Boolean(window.desktopAPI?.isElectron);
if (isElectron) {
  document.documentElement.classList.add('is-electron');
  document.body.classList.add('is-electron');
}
const $ = (id) => document.getElementById(id);

const els = {
  media: $('media'),
  volumeBar: $('volumeBar'),
  volumeValue: $('volumeValue'),
  dropHint: $('dropHint'),
  stage: $('stage'),
  playbackOverlay: $('playbackOverlay'),
  playbackOverlayLabel: $('playbackOverlayLabel'),
  videoWrap: $('videoWrap'),
  settingsModal: $('settingsModal'),
  aboutModal: $('aboutModal'),
  incomingCallModal: $('incomingCallModal'),
  connectModal: $('connectModal'),
  connectUrlInput: $('connectUrlInput'),
  connectError: $('connectError'),
  connectRecent: $('connectRecent'),
  connectRecentList: $('connectRecentList'),
  btnClearRecent: $('btnClearRecent'),
  progressModal: $('progressModal'),
  progressTitle: $('progressTitle'),
  progressName: $('progressName'),
  progressTrack: $('progressTrack'),
  progressFill: $('progressFill'),
  progressValue: $('progressValue'),
  progressDetail: $('progressDetail'),
  progressMeta: $('progressMeta'),
  progressSaved: $('progressSaved'),
  progressSavedName: $('progressSavedName'),
  progressSavedPath: $('progressSavedPath'),
  progressSavedSize: $('progressSavedSize'),
  progressSavedSizeRow: $('progressSavedSizeRow'),
  progressSavedElapsed: $('progressSavedElapsed'),
  progressSavedElapsedRow: $('progressSavedElapsedRow'),
  btnProgressCancel: $('btnProgressCancel'),
  btnProgressClose: $('btnProgressClose'),
  statusFile: $('statusFile'),
  statusFormat: $('statusFormat'),
  statusState: $('statusState'),
  statusTheme: $('statusTheme'),
  statusPlatform: $('statusPlatform'),
  webMediaInput: $('webMediaInput'),
  btnMic: $('btnMic'),
  btnControlOpen: $('btnControlOpen'),
  btnLocalCamera: $('btnLocalCamera'),
  btnDropConnect: $('btnDropConnect'),
  localPreview: $('localPreview'),
  localPreviewVideo: $('localPreviewVideo'),
  callBadge: $('callBadge'),
  callBadgeText: $('callBadgeText'),
  controlBar: $('controlBar'),
  btnLocale: $('btnLocale'),
  localeBtnLabel: $('localeBtnLabel'),
  btnFit: $('btnFit'),
  fitMenu: $('fitMenu'),
  fitList: $('fitList'),
  errorModal: $('errorModal'),
  errorTitle: $('errorTitle'),
  errorMessage: $('errorMessage'),
  errorDetail: $('errorDetail'),
  errorCopied: $('errorCopied'),
  btnCopyError: $('btnCopyError'),
  btnCloseError: $('btnCloseError')
};

const errorDialog = createErrorDialogController({
  dialog: els.errorModal,
  titleEl: els.errorTitle,
  messageEl: els.errorMessage,
  detailEl: els.errorDetail,
  copyBtn: els.btnCopyError,
  closeBtn: els.btnCloseError,
  copiedEl: els.errorCopied,
  t
});

function showAppError({
  title,
  message,
  detail = '',
  error = null,
  context = {},
  statusMessage = null
} = {}) {
  const summary = message || t('errorDefaultMessage');
  errorDialog.show({
    title: title || t('errorDefaultTitle'),
    message: summary,
    detail,
    error,
    context
  });
  setStatus({ state: statusMessage || summary });
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

let settings = loadSettings();
let currentObjectUrl = null;
let currentMediaPath = null;
/** Paths already converted after a decode error: 'soft' | 'full'. */
const compatTriedPaths = new Map();
let compatInFlight = false;
let currentMediaName = null;
let seeking = false;
/** @type {number|null} */
let pendingSeekTarget = null;
let seekWatchdog = 0;
let appInfo = null;
/** @type {string|null} */
let currentRtspUrl = null;
/** Peer phone HTTP live URL (IP-only calls), e.g. http://192.168.0.10:8765/live */
let currentPhoneUrl = null;
const PHONE_DEFAULT_PORT = 8765;
let rtspRecording = false;
/** @type {'rtsp' | 'open-rtsp' | null} */
let saveProgressMode = null;
let saveProgressCloseTimer = 0;
/** Abort flag for in-flight RTSP open. */
let openStreamCancelled = false;
/** Prevents double Play/Connect while RTSP open is running. */
let openStreamInFlight = false;
let overlayTimer = 0;
/** @type {'paused' | 'stopped' | null} */
let holdOverlayMode = null;
let stopRequested = false;
/** @type {MediaStream | null} */
let localCameraStream = null;
let localCameraWanted = false;
/** Outgoing microphone for video phone (toolbar mic toggle). */
let localMicEnabled = true;
/** @type {MediaStream | null} */
let localMicStream = null;
/** @type {AudioContext | null} */
let micAudioCtx = null;
/** @type {GainNode | null} */
let micGainNode = null;
/** @type {MediaStreamAudioSourceNode | null} */
let micSourceNode = null;
/** @type {null | { callId: string, fromIp: string, fromLabel: string }} */
let pendingIncomingCall = null;
/** True after we Accept an incoming call (even if peer video fails to load). */
let phoneSessionActive = false;
/** Active remote peer for hang-up signaling ({ host, port }). */
let activePeer = null;
/** Keep progressive fMP4 playback near the live edge (no VOD-style lag). */
let liveEdgeSyncTimer = 0;
/** Prevent re-entrant hang-up while tearing down a call. */
let hangUpInFlight = false;
/** Stall watchdog while watching a peer phone stream. */
let phoneStallTimer = 0;
/** Periodic check that a phone call is still alive. */
let callWatchTimer = 0;
/** Reconnect attempts after a live glitch (e.g. peer muted mic → publisher restart). */
let phoneRecoverTries = 0;
let phoneRecoverInFlight = false;
/** True live fMP4 via MSE (not progressive <video src>). */
const liveMse = createLiveMsePlayer(() => els.media, {
  onStreamEnded: () => {
    if (hangUpInFlight) return;
    if (currentPhoneUrl || phoneSessionActive) {
      void handlePhoneStreamLost();
    }
  }
});

// --- Outgoing publish -------------------------------------------------------
// The camera is captured HERE (getUserMedia), not by ffmpeg, so sensor/MIPI
// cameras that DirectShow cannot open still work. We record webm and stream the
// chunks to main, which transcodes them to fMP4 for peers. main drives the
// lifecycle via 'phone:publishSignal' (start/stop) keyed by a generation id.
/** @type {MediaStream | null} */
let publishStream = null;
/** @type {MediaRecorder | null} */
let publishRecorder = null;
let publishGeneration = 0;
/** Idle timer to release the camera after a call fully ends (not brief restarts). */
let publishReleaseTimer = 0;

function pickPublishMime() {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const m of candidates) {
    try {
      if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return 'video/webm';
}

function releasePublishStream() {
  if (publishStream) {
    for (const track of publishStream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    publishStream = null;
  }
}

async function ensurePublishStream() {
  const live = publishStream && publishStream.getVideoTracks().some((t) => t.readyState === 'live');
  if (live) return publishStream;
  releasePublishStream();
  publishStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  return publishStream;
}

function stopPublishRecorder() {
  if (publishRecorder) {
    try {
      if (publishRecorder.state !== 'inactive') publishRecorder.stop();
    } catch {
      /* ignore */
    }
    publishRecorder = null;
  }
}

function reportPublishStatus(status) {
  try {
    window.desktopAPI?.phonePublishStatus?.(status);
  } catch {
    /* ignore */
  }
}

async function startPublishCapture(generation) {
  if (publishReleaseTimer) {
    clearTimeout(publishReleaseTimer);
    publishReleaseTimer = 0;
  }
  publishGeneration = generation;
  reportPublishStatus(`signal gen=${generation}`);
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    reportPublishStatus('no MediaRecorder/getUserMedia');
    return;
  }
  try {
    const stream = await ensurePublishStream();
    if (publishGeneration !== generation) return; // superseded while awaiting
    const vCount = stream.getVideoTracks().length;
    const hasAudio = stream.getAudioTracks().length > 0;
    reportPublishStatus(`stream video=${vCount} audio=${hasAudio}`);
    stopPublishRecorder();
    const mimeType = pickPublishMime();
    try {
      void window.desktopAPI?.phonePublishConfig?.({ hasAudio, mimeType });
    } catch {
      /* ignore */
    }
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_200_000 });
    } catch (recErr) {
      reportPublishStatus(`MediaRecorder ctor failed: ${recErr?.name || recErr}`);
      return;
    }
    publishRecorder = recorder;
    let firstChunk = true;
    recorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      if (publishGeneration !== generation) return; // stale generation
      try {
        const buf = new Uint8Array(await e.data.arrayBuffer());
        window.desktopAPI?.phonePublishChunk?.(generation, buf);
        if (firstChunk) {
          firstChunk = false;
          reportPublishStatus(`first-chunk ${buf.length}B`);
        }
      } catch {
        /* ignore */
      }
    };
    recorder.onerror = (ev) => {
      reportPublishStatus(`recorder error: ${ev?.error?.name || 'unknown'}`);
    };
    // 200ms timeslice: first blob carries the webm header, then live clusters.
    recorder.start(200);
    reportPublishStatus(`recording mime=${mimeType}`);
  } catch (err) {
    // Camera/mic unavailable — the publisher gets no data and the peer will see
    // a connect error rather than a frozen call.
    reportPublishStatus(`getUserMedia failed: ${err?.name || err}`);
  }
}

function stopPublishCapture() {
  stopPublishRecorder();
  // Don't drop the camera on brief restarts (mic toggle / reconnect send
  // stop→start within a moment). Release only after a real idle gap.
  if (publishReleaseTimer) clearTimeout(publishReleaseTimer);
  publishReleaseTimer = window.setTimeout(() => {
    publishReleaseTimer = 0;
    releasePublishStream();
  }, 4000);
}

function setActivePeer(host, port) {
  const h = canonicalizeLoopbackHost(host);
  const p = Number(port) || phonePort();
  if (!h || /^127\./.test(h)) {
    activePeer = null;
    return;
  }
  activePeer = { host: h, port: p };
}

function clearActivePeer() {
  activePeer = null;
}

function markPhoneCallActive(active) {
  try {
    void window.desktopAPI?.setPhoneCallActive?.(Boolean(active));
  } catch {
    /* ignore */
  }
}

/** Synchronously clear “통화 중” chrome (safe to call even during hang-up). */
function forceReleasePhoneCallUi(remote = false) {
  phoneSessionActive = false;
  currentPhoneUrl = null;
  clearActivePeer();
  stopCallWatch();
  stopLiveEdgeSync();
  clearPhoneStallWatch();
  document.body.classList.remove('is-live-call');
  els.dropHint?.classList.remove('hidden');
  setStatus({
    file: statusKey('statusReady'),
    format: '—',
    state: statusKey(remote ? 'statusRemoteHangup' : 'statusIdle')
  });
  updateCallChrome();
}

function stopCallWatch() {
  if (callWatchTimer) {
    clearInterval(callWatchTimer);
    callWatchTimer = 0;
  }
}

/** True while the main stage still has peer video to show (do not auto-end). */
function isPhoneVideoPresenting() {
  if (!(currentPhoneUrl || phoneSessionActive)) return false;
  const v = els.media;
  if (!v) return false;
  try {
    if (v.videoWidth > 0 && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return true;
    if (v.buffered && v.buffered.length > 0) {
      const end = v.buffered.end(v.buffered.length - 1);
      if (end > 0) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function startCallWatch() {
  stopCallWatch();
  let idleTicks = 0;
  let lastSeg = -1;
  let missStatus = 0;
  callWatchTimer = window.setInterval(() => {
    if (hangUpInFlight) return;
    if (!phoneSessionActive && !currentPhoneUrl && !activePeer) {
      stopCallWatch();
      return;
    }

    // Peer /status: only as a fallback when video is already gone (missed /bye).
    // Never end while peer video is still on screen — hang-up is the call button.
    if (activePeer?.host && window.desktopAPI?.phonePeerStatus) {
      void window.desktopAPI.phonePeerStatus(activePeer.host, activePeer.port).then((st) => {
        if (hangUpInFlight) return;
        if (!phoneSessionActive && !currentPhoneUrl && !activePeer) return;
        if (isPhoneVideoPresenting()) {
          missStatus = 0;
          return;
        }
        if (!st?.reachable) {
          missStatus += 1;
          if (missStatus >= 4) void endCallFromRemote();
          return;
        }
        missStatus = 0;
        if (st.inCall === false) void endCallFromRemote();
      });
    }

    // Stream stalled — reconnect only; do not hang up.
    if (currentPhoneUrl && liveMse.active) {
      const seg = liveMse.segments || 0;
      if (seg > lastSeg) {
        lastSeg = seg;
        idleTicks = 0;
        phoneRecoverTries = 0;
      } else {
        idleTicks += 1;
      }
      if (idleTicks >= 6 && lastSeg > 0) {
        idleTicks = 0;
        void handlePhoneStreamLost();
      }
    }
  }, 1000);
}

/**
 * Live HTTP/MSE glitched — reconnect only.
 * Call ends solely via the hang-up button (or peer /bye), never because video hiccuped.
 */
/**
 * Blank the peer video stage so a dropped stream does not leave a frozen last
 * frame. Does NOT end the call (hang-up is the call button); if the stream
 * recovers, playback repopulates the element.
 */
async function clearPhoneVideoSurface() {
  try {
    await liveMse.stop();
  } catch {
    /* ignore */
  }
  try {
    els.media.pause();
    els.media.removeAttribute('src');
    els.media.load();
  } catch {
    /* ignore */
  }
  hidePlaybackOverlay(true);
}

async function handlePhoneStreamLost() {
  if (hangUpInFlight || phoneRecoverInFlight) return;
  if (!phoneSessionActive && !currentPhoneUrl) return;
  const url = currentPhoneUrl;
  if (!url || phoneRecoverTries >= 3) {
    // Reconnection exhausted (or nothing to reconnect to) — clear the frozen
    // last frame instead of leaving it on screen.
    await clearPhoneVideoSurface();
    return;
  }
  phoneRecoverInFlight = true;
  phoneRecoverTries += 1;
  try {
    await liveMse.start(url);
    try {
      await els.media.play();
    } catch {
      /* ignore */
    }
  } catch {
    window.setTimeout(() => {
      void handlePhoneStreamLost();
    }, 700);
  } finally {
    phoneRecoverInFlight = false;
  }
}

function clearOverlayTimer() {
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = 0;
  }
}

const OVERLAY_ICON_MAP = {
  play: '.ov-play',
  paused: '.ov-pause',
  stopped: '.ov-stop'
};

function setOverlayIcon(card, mode) {
  const icons = card.querySelectorAll('.playback-overlay-icon svg');
  icons.forEach((svg) => svg.classList.remove('is-on'));
  const sel = OVERLAY_ICON_MAP[mode] || OVERLAY_ICON_MAP.play;
  card.querySelector(sel)?.classList.add('is-on');
}

function showPlaybackOverlay(mode, { hold = false, label } = {}) {
  const root = els.playbackOverlay;
  const card = root?.querySelector('.playback-overlay-card');
  if (!root || !card) return;

  clearOverlayTimer();
  holdOverlayMode = null;

  const labels = {
    play: t('overlayPlay'),
    paused: t('overlayPaused'),
    stopped: t('overlayStopped')
  };

  // Exclusive mode + single glyph (prevents pause+play icons stacking).
  card.dataset.mode = mode;
  setOverlayIcon(card, mode);
  els.playbackOverlayLabel.textContent = label || labels[mode] || mode;

  root.hidden = false;
  root.classList.remove('dimmed');
  root.classList.add('visible');

  // restart pop animation on the card only
  card.style.animation = 'none';
  void card.offsetHeight;
  card.style.animation = '';

  if (hold) {
    holdOverlayMode = mode === 'play' ? null : mode;
    return;
  }

  overlayTimer = window.setTimeout(() => {
    hidePlaybackOverlay(true);
  }, 700);
}

function hidePlaybackOverlay(force = false) {
  if (!force && holdOverlayMode) return;
  clearOverlayTimer();
  holdOverlayMode = null;
  const root = els.playbackOverlay;
  const card = root?.querySelector('.playback-overlay-card');
  if (!root) return;
  root.classList.remove('visible', 'dimmed');
  if (card) {
    card.querySelectorAll('.playback-overlay-icon svg').forEach((svg) => {
      svg.classList.remove('is-on');
    });
  }
  overlayTimer = window.setTimeout(() => {
    root.hidden = true;
    overlayTimer = 0;
  }, 160);
}

/** Coalesce overlay flashes so pause→play never stacks two glyphs. */
let lastOverlayNotify = { mode: '', at: 0 };
let overlaySeq = 0;

function notifyOverlayOnce(mode, options) {
  const now = Date.now();
  // Ignore duplicate same-mode events
  if (lastOverlayNotify.mode === mode && now - lastOverlayNotify.at < 350) {
    return;
  }
  // If switching quickly (e.g. pause then play), replace — never layer.
  lastOverlayNotify = { mode, at: now };
  const seq = ++overlaySeq;
  showPlaybackOverlay(mode, options);
  // Drop stale hide timers from a replaced flash
  if (seq !== overlaySeq) return;
}

function notifyPlaying() {
  stopRequested = false;
  holdOverlayMode = null;
  // Video phone: no play/pause chrome.
}

function notifyPaused() {
  // Video phone: no play/pause chrome.
}

function notifyStopped() {
  stopRequested = true;
  holdOverlayMode = null;
  notifyOverlayOnce('stopped', { hold: false, label: t('overlayStopped') });
}

function updateMicButton() {
  const btn = els.btnMic;
  if (!btn) return;
  btn.disabled = false;
  btn.setAttribute('aria-pressed', String(localMicEnabled));
  btn.classList.toggle('is-mic-off', !localMicEnabled);
  btn.classList.toggle('is-active', localMicEnabled);
  btn.setAttribute('data-tooltip', localMicEnabled ? t('micOnTip') : t('micOffTip'));
  btn.setAttribute('aria-label', t('mic'));
  btn.querySelector('.icon-mic')?.classList.toggle('hidden', !localMicEnabled);
  btn.querySelector('.icon-mic-off')?.classList.toggle('hidden', localMicEnabled);
}

function updateSaveButton() {
  // Call recording remains available via Ctrl+S; toolbar button is microphone.
  updateMicButton();
  updateCallChrome();
}

function clampMicVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampStartVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 80;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function updateMicVolumeUi(percent) {
  const value = clampMicVolume(percent);
  const input = $('settingMicVolume');
  const out = $('settingMicVolumeValue');
  if (input) {
    input.value = String(value);
    syncRangeFill(input);
    input.setAttribute('aria-valuetext', `${value}%`);
  }
  if (out) out.textContent = `${value}%`;
}

function updateStartVolumeUi(percent) {
  const value = clampStartVolume(percent);
  const input = $('settingStartVolume');
  const out = $('settingStartVolumeValue');
  if (input) {
    input.value = String(value);
    syncRangeFill(input);
    input.setAttribute('aria-valuetext', `${value}%`);
  }
  if (out) out.textContent = `${value}%`;
}

function teardownMicAudioGraph() {
  try {
    micSourceNode?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    micGainNode?.disconnect();
  } catch {
    /* ignore */
  }
  micSourceNode = null;
  micGainNode = null;
  if (micAudioCtx) {
    try {
      void micAudioCtx.close();
    } catch {
      /* ignore */
    }
    micAudioCtx = null;
  }
}

function applyLocalMicGain() {
  const linear = localMicEnabled ? clampMicVolume(settings.micVolume) / 100 : 0;
  if (micGainNode) {
    try {
      micGainNode.gain.value = linear;
    } catch {
      /* ignore */
    }
  }
  if (localMicStream) {
    for (const track of localMicStream.getAudioTracks()) {
      track.enabled = localMicEnabled && linear > 0;
    }
  }
}

async function ensureMicAudioGraph() {
  if (!localMicStream) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!micAudioCtx) micAudioCtx = new Ctx();
    if (micAudioCtx.state === 'suspended') {
      try {
        await micAudioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    if (!micGainNode) {
      micGainNode = micAudioCtx.createGain();
    }
    if (!micSourceNode) {
      micSourceNode = micAudioCtx.createMediaStreamSource(localMicStream);
      micSourceNode.connect(micGainNode);
      // Keep graph alive without monitoring (avoids echo).
      micGainNode.connect(micAudioCtx.createMediaStreamDestination());
    }
    applyLocalMicGain();
  } catch {
    /* ignore — gain is best-effort for local capture path */
  }
}

async function syncPhoneMicToMain() {
  if (!isElectron || !window.desktopAPI?.setPhoneMic) return;
  // Publisher soft-restarts to apply mute/volume — peer may briefly stall.
  phoneRecoverTries = 0;
  try {
    await window.desktopAPI.setPhoneMic({
      enabled: localMicEnabled,
      volume: clampMicVolume(settings.micVolume),
      restart: true
    });
  } catch {
    /* ignore */
  }
}

async function applyMicVolume(percent, { persist = true, syncPhone = true } = {}) {
  settings.micVolume = clampMicVolume(percent);
  updateMicVolumeUi(settings.micVolume);
  if (persist) saveSettings(settings);
  applyLocalMicGain();
  if (syncPhone) await syncPhoneMicToMain();
}

async function setLocalMicEnabled(on, { announce = false } = {}) {
  const want = Boolean(on);
  if (want) {
    if (!navigator.mediaDevices?.getUserMedia) {
      localMicEnabled = false;
      updateMicButton();
      if (announce) setStatus({ state: statusKey('statusMicDenied') });
      await syncPhoneMicToMain();
      return false;
    }
    try {
      if (!localMicStream) {
        localMicStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        await ensureMicAudioGraph();
      }
      localMicEnabled = true;
      applyLocalMicGain();
      updateMicButton();
      await syncPhoneMicToMain();
      if (announce) setStatus({ state: statusKey('statusMicOn') });
      return true;
    } catch {
      localMicEnabled = false;
      teardownMicAudioGraph();
      localMicStream = null;
      updateMicButton();
      await syncPhoneMicToMain();
      if (announce) setStatus({ state: statusKey('statusMicDenied') });
      return false;
    }
  }

  localMicEnabled = false;
  applyLocalMicGain();
  if (localMicStream) {
    for (const track of localMicStream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    localMicStream = null;
  }
  teardownMicAudioGraph();
  updateMicButton();
  await syncPhoneMicToMain();
  if (announce) setStatus({ state: statusKey('statusMicOff') });
  return false;
}

async function toggleLocalMic() {
  await setLocalMicEnabled(!localMicEnabled, { announce: true });
}

function isLiveCall() {
  return Boolean(currentRtspUrl || currentPhoneUrl || phoneSessionActive);
}

function notifyDesktop(title, body, { silent = false } = {}) {
  if (!isElectron || !window.desktopAPI?.notify) return;
  try {
    void window.desktopAPI.notify({
      title: title || t('appTitle'),
      body: body || '',
      silent
    });
  } catch {
    /* ignore */
  }
}

function canHangUpCall() {
  return isLiveCall() || rtspRecording || openStreamInFlight;
}

function syncControlCallButton() {
  const btn = els.btnControlOpen;
  if (!btn) return;
  const hangup = canHangUpCall();
  btn.classList.toggle('tool-btn-hangup', hangup);
  btn.classList.toggle('tool-btn-primary', !hangup);
  btn.classList.toggle('is-hangup', hangup);
  btn.querySelector('.icon-call-connect')?.classList.toggle('hidden', hangup);
  btn.querySelector('.icon-call-hangup')?.classList.toggle('hidden', !hangup);
  const tipKey = hangup ? 'hangupTip' : 'connectTip';
  const ariaKey = hangup ? 'hangup' : 'connect';
  btn.setAttribute('data-i18n-tooltip', tipKey);
  btn.setAttribute('data-tooltip', t(tipKey));
  btn.setAttribute('data-i18n-aria', ariaKey);
  btn.setAttribute('aria-label', t(ariaKey));
}

function onControlCallClick() {
  if (canHangUpCall()) {
    void hangUpCall();
    return;
  }
  openConnectDialog();
}

function updateCallChrome() {
  const live = isLiveCall();
  const connecting = openStreamInFlight && !live;
  syncControlCallButton();
  document.body.classList.toggle('is-live-call', live);
  document.body.classList.toggle('is-call-recording', rtspRecording);

  if (els.callBadge) {
    const show = live || connecting || rtspRecording || Boolean(els.dropHint && !els.dropHint.classList.contains('hidden'));
    els.callBadge.hidden = !show;
  }
  if (els.callBadgeText) {
    if (rtspRecording) els.callBadgeText.textContent = t('callBadgeRecording');
    else if (live) els.callBadgeText.textContent = t('callBadgeLive');
    else if (connecting) els.callBadgeText.textContent = t('callBadgeConnecting');
    else els.callBadgeText.textContent = t('callBadgeIdle');
  }

  syncLocalPreviewVisibility();
}

function isLocalPreviewLive() {
  if (localCameraStream) return true;
  const video = els.localPreviewVideo;
  if (!video) return false;
  if (video.srcObject) return true;
  return Boolean(video.getAttribute('src'));
}

function syncLocalPreviewVisibility() {
  const wrap = els.localPreview;
  const video = els.localPreviewVideo;
  if (!wrap || !video) return;
  const hasFeed = isLocalPreviewLive();
  const shouldShow =
    Boolean(settings.showLocalPreview) &&
    localCameraWanted &&
    hasFeed &&
    (isLiveCall() || Boolean(els.dropHint && !els.dropHint.classList.contains('hidden')));
  wrap.hidden = !shouldShow;
  els.btnLocalCamera?.setAttribute('aria-pressed', String(localCameraWanted && Boolean(settings.showLocalPreview)));
  els.btnLocalCamera?.classList.toggle('is-active', localCameraWanted && hasFeed);
}

async function startLocalCameraViaPhoneHttp() {
  if (!isElectron || !window.desktopAPI?.setPhonePublish) return false;
  await window.desktopAPI.setPhonePublish(true);
  const info = (await window.desktopAPI.getPhoneInfo?.()) || {};
  const liveUrl = info.localLiveUrl || appInfo?.phoneLiveUrl || '';
  if (!els.localPreviewVideo || !liveUrl) return false;
  els.localPreviewVideo.srcObject = null;
  if (els.localPreviewVideo.getAttribute('src') !== liveUrl) {
    els.localPreviewVideo.src = liveUrl;
  }
  try {
    await els.localPreviewVideo.play();
  } catch {
    /* autoplay may be blocked briefly */
  }
  // Wait briefly for the live fMP4 to become ready; otherwise treat as failure.
  await new Promise((r) => setTimeout(r, 400));
  if (els.localPreviewVideo.readyState < 2 && els.localPreviewVideo.error) {
    return false;
  }
  return true;
}

async function startLocalCamera({ announce = false } = {}) {
  // Keep LAN publish enabled so peers can still dial by IP while preview is on.
  if (isElectron && window.desktopAPI?.setPhonePublish) {
    try {
      await window.desktopAPI.setPhonePublish(true);
    } catch {
      /* ignore */
    }
  }

  if (localCameraStream) {
    localCameraWanted = true;
    if (els.localPreviewVideo) {
      els.localPreviewVideo.removeAttribute('src');
      els.localPreviewVideo.srcObject = localCameraStream;
      try {
        await els.localPreviewVideo.play();
      } catch {
        /* ignore */
      }
    }
    syncLocalPreviewVisibility();
    if (announce) setStatus({ state: statusKey('statusLocalCameraOn') });
    return true;
  }

  // Prefer getUserMedia for a reliable local PIP preview.
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      localCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      localCameraWanted = true;
      if (els.localPreviewVideo) {
        els.localPreviewVideo.removeAttribute('src');
        els.localPreviewVideo.srcObject = localCameraStream;
        try {
          await els.localPreviewVideo.play();
        } catch {
          /* autoplay may be blocked briefly */
        }
      }
      syncLocalPreviewVisibility();
      if (announce) setStatus({ state: statusKey('statusLocalCameraOn') });
      return true;
    } catch {
      localCameraStream = null;
    }
  }

  // Fallback: phone LAN HTTP live (ffmpeg). Also keeps IP-call publish path usable.
  try {
    const ok = await startLocalCameraViaPhoneHttp();
    if (ok) {
      localCameraWanted = true;
      syncLocalPreviewVisibility();
      if (announce) setStatus({ state: statusKey('statusLocalCameraOn') });
      return true;
    }
  } catch {
    /* ignore */
  }

  localCameraWanted = false;
  syncLocalPreviewVisibility();
  if (announce) setStatus({ state: statusKey('statusLocalCameraDenied') });
  return false;
}

function stopLocalCamera({ announce = false } = {}) {
  localCameraWanted = false;
  if (els.localPreviewVideo) {
    try {
      els.localPreviewVideo.pause();
    } catch {
      /* ignore */
    }
    els.localPreviewVideo.removeAttribute('src');
    els.localPreviewVideo.srcObject = null;
    try {
      els.localPreviewVideo.load();
    } catch {
      /* ignore */
    }
  }
  if (localCameraStream) {
    for (const track of localCameraStream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
    localCameraStream = null;
  }
  // Keep LAN publish on while the window is open so peers can still dial by IP.
  // Tray hide disables publish from the main process.
  syncLocalPreviewVisibility();
  if (announce) setStatus({ state: statusKey('statusLocalCameraOff') });
}

async function toggleLocalCamera() {
  if (localCameraWanted && isLocalPreviewLive()) {
    stopLocalCamera({ announce: true });
    return;
  }
  settings.showLocalPreview = true;
  saveSettings(settings);
  if ($('settingShowLocalPreview')) $('settingShowLocalPreview').checked = true;
  await startLocalCamera({ announce: true });
}

function stopLiveEdgeSync() {
  if (liveEdgeSyncTimer) {
    clearInterval(liveEdgeSyncTimer);
    liveEdgeSyncTimer = 0;
  }
}

/**
 * Progressive live fMP4 buffers ahead; keep playback on the live edge.
 * @param {HTMLMediaElement | null | undefined} video
 */
function chaseLiveEdge(video) {
  if (!video || video.paused || video.readyState < 2) return;
  const buf = video.buffered;
  if (!buf || buf.length === 0) return;
  try {
    const liveEdge = buf.end(buf.length - 1);
    const lag = liveEdge - video.currentTime;
    // Stay near real-time — call video is never VOD scrubbing.
    if (lag > 0.35) {
      video.currentTime = Math.max(0, liveEdge - 0.05);
    }
  } catch {
    /* ignore seek errors while stream is updating */
  }
}

function startLiveEdgeSync() {
  stopLiveEdgeSync();
  liveEdgeSyncTimer = window.setInterval(() => {
    if (!currentPhoneUrl && !currentRtspUrl) {
      stopLiveEdgeSync();
      return;
    }
    chaseLiveEdge(els.media);
    // HTTP local PIP (not getUserMedia) also needs live chase.
    if (els.localPreviewVideo && !els.localPreviewVideo.srcObject) {
      chaseLiveEdge(els.localPreviewVideo);
    }
  }, 250);
}

function clearPhoneStallWatch() {
  if (phoneStallTimer) {
    clearTimeout(phoneStallTimer);
    phoneStallTimer = 0;
  }
}

function armPhoneStallWatch() {
  clearPhoneStallWatch();
  if (!currentPhoneUrl && !phoneSessionActive) return;
  phoneStallTimer = window.setTimeout(() => {
    phoneStallTimer = 0;
    if (!currentPhoneUrl && !phoneSessionActive) return;
    void handlePhoneStreamLost();
  }, 8000);
}

/**
 * Peer hung up or their live stream died — release local call state quietly.
 */
async function endCallFromRemote() {
  // Always clear “통화 중” UI first (even if a hang-up is already in flight).
  const hadCall = Boolean(phoneSessionActive || currentPhoneUrl || activePeer || openStreamInFlight);
  forceReleasePhoneCallUi(true);
  markPhoneCallActive(false);
  if (!hadCall && !rtspRecording) return;
  if (hangUpInFlight) {
    try {
      await liveMse.stop();
    } catch {
      /* ignore */
    }
    return;
  }
  await hangUpCall({ remote: true, force: true });
}

/**
 * @param {{ remote?: boolean, force?: boolean }} [options]
 */
async function hangUpCall(options = {}) {
  const remote = Boolean(options.remote);
  const force = Boolean(options.force);
  if (hangUpInFlight) {
    forceReleasePhoneCallUi(remote);
    markPhoneCallActive(false);
    return;
  }
  const wasLive = Boolean(
    force ||
      phoneSessionActive ||
      currentPhoneUrl ||
      openStreamInFlight ||
      currentRtspUrl ||
      activePeer
  );
  if (!wasLive && !rtspRecording) return;
  hangUpInFlight = true;

  // Drop “통화 중” immediately so UI never sticks after peer is gone.
  const peer = activePeer;
  forceReleasePhoneCallUi(remote);
  // Keep peer IP maps until clearSessions so main can /bye every known peer.

  try {
    if (openStreamInFlight) {
      openStreamCancelled = true;
    }
    // Local hang-up: notify peer(s) first, then tear down publish/view.
    if (!remote) {
      if (peer?.host && window.desktopAPI?.phoneBye) {
        try {
          await window.desktopAPI.phoneBye(peer.host, peer.port);
        } catch {
          /* ignore */
        }
      }
      // clearSessions also POSTs /bye to callback/token/viewer IPs (caller→callee).
      try {
        await window.desktopAPI?.phoneClearSessions?.();
      } catch {
        /* ignore */
      }
      markPhoneCallActive(false);
    } else {
      markPhoneCallActive(false);
      try {
        await window.desktopAPI?.phoneClearSessions?.();
      } catch {
        /* ignore */
      }
    }
    if (rtspRecording) {
      await finalizeRtspRecordIfAny();
    }
    await stopRtspBridge({ finalizeRecord: false });
    try {
      await liveMse.stop();
    } catch {
      /* ignore */
    }
    stopRequested = true;
    els.media.pause();
    els.media.removeAttribute('src');
    els.media.load();
    revokeObjectUrl();
    currentMediaPath = null;
    currentMediaName = null;
    hidePlaybackOverlay(true);
    els.dropHint?.classList.remove('hidden');
    forceReleasePhoneCallUi(remote);
    if (wasLive) {
      notifyDesktop(t('appTitle'), remote ? t('notifyRemoteHangup') : t('notifyCallEnded'));
    }
    if (settings.showLocalPreview) {
      localCameraWanted = true;
      void startLocalCamera();
    }
  } finally {
    stopRequested = false;
    hangUpInFlight = false;
    markPhoneCallActive(false);
    forceReleasePhoneCallUi(remote);
  }
}

function isRtspUrl(input) {
  return /^rtsps?:\/\//i.test(String(input || '').trim());
}

function isHttpUrl(input) {
  return /^https?:\/\//i.test(String(input || '').trim());
}

function phonePort() {
  const n = Number(appInfo?.phoneDefaultPort || appInfo?.phonePort || PHONE_DEFAULT_PORT);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : PHONE_DEFAULT_PORT;
}

/** Chromium treats localhost and 127.0.0.1 as different sites for media. */
function canonicalizeLoopbackHost(host) {
  const h = String(host || '').trim().toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0') return '127.0.0.1';
  return String(host || '').trim();
}

/**
 * Play phone /live via the UI server (same origin as index.html).
 * Avoids “Media load rejected by URL safety check” for localhost vs 127.0.0.1.
 */
function toUiPhonePlayUrl(host, port, token = '') {
  const h = canonicalizeLoopbackHost(host);
  const p = Number(port) || phonePort();
  const uiPort = Number(appInfo?.uiPort);
  if (Number.isFinite(uiPort) && uiPort > 0) {
    const params = new URLSearchParams({ host: h, port: String(p) });
    if (token) params.set('token', String(token));
    return `http://127.0.0.1:${uiPort}/__phone/live?${params.toString()}`;
  }
  return token
    ? `http://${h}:${p}/live?token=${encodeURIComponent(token)}`
    : `http://${h}:${p}/live`;
}

/**
 * Accept bare IP / host (optional :port) and expand to the phone live URL.
 * Full rtsp:// or http(s):// URLs pass through unchanged.
 */
function normalizeConnectAddress(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';
  if (isRtspUrl(input)) return input;
  if (isHttpUrl(input)) {
    try {
      const u = new URL(input);
      u.hostname = canonicalizeLoopbackHost(u.hostname);
      return u.href;
    } catch {
      return input;
    }
  }

  let host = input;
  let port = phonePort();

  if (input.startsWith('[')) {
    const end = input.indexOf(']');
    if (end > 0) {
      host = input.slice(0, end + 1);
      const rest = input.slice(end + 1);
      if (rest.startsWith(':')) {
        const p = Number(rest.slice(1));
        if (Number.isFinite(p) && p > 0 && p <= 65535) port = p;
      }
    }
  } else {
    const m = input.match(/^(.+):(\d{1,5})$/);
    if (m && !m[1].includes('://')) {
      host = m[1];
      const p = Number(m[2]);
      if (Number.isFinite(p) && p > 0 && p <= 65535) port = p;
    }
  }

  host = canonicalizeLoopbackHost(host);
  if (!/^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])$/.test(host)) {
    return '';
  }

  return `http://${host}:${port}/live`;
}

function rtspDisplayName(url) {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url;
  }
}

async function finalizeRtspRecordIfAny() {
  if (!isElectron || !window.desktopAPI?.stopRtspRecord) {
    rtspRecording = false;
    updateSaveButton();
    return null;
  }
  if (!rtspRecording) {
    try {
      const active = await window.desktopAPI.getRtspRecording?.();
      if (!active) return null;
    } catch {
      return null;
    }
  }
  try {
    const result = await window.desktopAPI.stopRtspRecord({ discard: false });
    rtspRecording = false;
    updateSaveButton();
    return result;
  } catch {
    rtspRecording = false;
    updateSaveButton();
    return null;
  }
}

async function stopRtspBridge({ finalizeRecord = false } = {}) {
  if (finalizeRecord) {
    const recorded = await finalizeRtspRecordIfAny();
    if (recorded?.ok && recorded.path) {
      setStatus({
        state: statusKey('statusRtspRecordSaved'),
        file: recorded.path
      });
    }
  }
  if (!currentRtspUrl && !(isElectron && window.desktopAPI?.stopRtsp)) {
    currentRtspUrl = null;
    updateSaveButton();
    return;
  }
  currentRtspUrl = null;
  if (isElectron && window.desktopAPI?.stopRtsp) {
    try {
      await window.desktopAPI.stopRtsp();
    } catch {
      /* ignore */
    }
  }
  updateSaveButton();
  updateCallChrome();
}

function closeToolbarMenus({ except = null } = {}) {
  if (except !== 'fit') closeFitMenu();
}

function fitLabelKey(mode) {
  if (mode === 'cover') return 'fitCover';
  if (mode === 'actual') return 'fitActual';
  return 'fitContain';
}

function fitStatusKey(mode) {
  if (mode === 'cover') return 'statusFitCover';
  if (mode === 'actual') return 'statusFitActual';
  return 'statusFitContain';
}

function updateActualMediaSize() {
  if (!els.media) return;
  if (normalizeVideoFit(settings.videoFit) !== 'actual') {
    els.media.style.width = '';
    els.media.style.height = '';
    return;
  }
  const w = els.media.videoWidth;
  const h = els.media.videoHeight;
  if (w > 0 && h > 0) {
    els.media.style.width = `${w}px`;
    els.media.style.height = `${h}px`;
  }
}

function updateFitMenuSelection() {
  const current = normalizeVideoFit(settings.videoFit);
  els.fitList?.querySelectorAll('[data-fit]').forEach((btn) => {
    const active = btn.dataset.fit === current;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
    const check = btn.querySelector('.popup-item-check');
    if (check) check.textContent = active ? '✓' : '';
  });
}

function updateFitToolbarButton() {
  const current = normalizeVideoFit(settings.videoFit);
  const label = t(fitLabelKey(current));
  els.btnFit?.setAttribute('data-tooltip', `${t('fitTip')}: ${label}`);
  els.btnFit?.setAttribute('aria-label', `${t('fit')}: ${label}`);
}

function applyVideoFit(mode, { persist = true, announce = false } = {}) {
  const next = normalizeVideoFit(mode);
  settings.videoFit = next;
  if (persist) saveSettings(settings);
  els.videoWrap?.classList.remove('fit-contain', 'fit-cover', 'fit-actual');
  els.videoWrap?.classList.add(`fit-${next}`);
  updateActualMediaSize();
  updateFitMenuSelection();
  updateFitToolbarButton();
  if (announce) setStatus({ state: statusKey(fitStatusKey(next)) });
}

/**
 * Place a popup under its anchor button and keep it inside the viewport.
 * Prefer left-align with the button; fall back to right-align if it would overflow.
 */
function positionMenuUnderAnchor(menu, anchor) {
  if (!menu || !anchor) return;
  menu.classList.add('is-anchored');
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.style.right = 'auto';
  menu.hidden = false;

  const btn = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const pad = 8;
  let left = btn.left;
  let top = btn.bottom + 4;

  if (left + menuRect.width > window.innerWidth - pad) {
    left = btn.right - menuRect.width;
  }
  left = Math.min(Math.max(pad, left), Math.max(pad, window.innerWidth - menuRect.width - pad));

  if (top + menuRect.height > window.innerHeight - pad) {
    top = btn.top - menuRect.height - 4;
  }
  top = Math.min(Math.max(pad, top), Math.max(pad, window.innerHeight - menuRect.height - pad));

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function clearMenuAnchorPosition(menu) {
  if (!menu) return;
  menu.classList.remove('is-anchored');
  menu.style.left = '';
  menu.style.top = '';
  menu.style.right = '';
}

function openFitMenu() {
  closeToolbarMenus({ except: 'fit' });
  updateFitMenuSelection();
  syncThemeToOverlays();
  if (els.fitMenu && els.btnFit) {
    positionMenuUnderAnchor(els.fitMenu, els.btnFit);
  } else if (els.fitMenu) {
    els.fitMenu.hidden = false;
  }
  els.btnFit?.setAttribute('aria-expanded', 'true');
}

function closeFitMenu() {
  if (!els.fitMenu) return;
  els.fitMenu.hidden = true;
  clearMenuAnchorPosition(els.fitMenu);
  els.btnFit?.setAttribute('aria-expanded', 'false');
}

function toggleFitMenu() {
  if (els.fitMenu?.hidden) openFitMenu();
  else closeFitMenu();
}

function updateLocaleToolbarButton() {
  const locale = getLocaleSafe();
  // Show the language you can switch to (not the current one).
  const nextLabel = locale === 'ko' ? 'ENG' : '한글';
  if (els.localeBtnLabel) els.localeBtnLabel.textContent = nextLabel;
  els.btnLocale?.setAttribute('data-tooltip', `${t('languageTip')}: ${nextLabel}`);
  els.btnLocale?.setAttribute('aria-label', `${t('language')}: ${nextLabel}`);
  syncWindowMinWidth();
}

/** Last applied content min-width (avoid redundant IPC). */
let appliedWindowMinWidth = 0;
/** Resize to measured min once after first toolbar layout. */
let didFitInitialWindow = false;

/**
 * Intrinsic toolbar width: all visible controls/labels, spacer at its CSS min-width.
 * Uses each child's scrollWidth so a currently-narrow window does not under-measure.
 */
function measureToolbarMinWidth() {
  const toolbar = $('toolbar');
  if (!toolbar) return 420;
  const styles = getComputedStyle(toolbar);
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;
  let total = 0;
  let count = 0;
  for (const child of toolbar.children) {
    const cs = getComputedStyle(child);
    if (cs.display === 'none') continue;
    if (child.classList.contains('toolbar-spacer')) {
      const minSp = parseFloat(cs.minWidth);
      total += Number.isFinite(minSp) && minSp > 0 ? minSp : 8;
    } else {
      total += Math.ceil(Math.max(child.scrollWidth, child.offsetWidth));
    }
    count += 1;
  }
  const pad =
    (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  // +4 covers sub-pixel / border rounding on Windows DPI scaling.
  return Math.ceil(total + gap * Math.max(0, count - 1) + pad + 4);
}

/** Min window size = toolbar content width so buttons/labels never clip. */
function syncWindowMinWidth() {
  if (!isElectron || !window.desktopAPI?.setMinimumSize) return;
  const apply = () => {
    const minW = Math.max(360, measureToolbarMinWidth());
    const minH = 640;
    const fitInitial = !didFitInitialWindow;
    if (!fitInitial && Math.abs(minW - appliedWindowMinWidth) < 1) return;
    appliedWindowMinWidth = minW;
    didFitInitialWindow = true;
    void window.desktopAPI.setMinimumSize(minW, minH, {
      fitInitial,
      initialHeight: 780
    });
  };
  // Wait a frame so locale labels / electron-only controls have finished layout.
  requestAnimationFrame(apply);
}

function toggleLocale() {
  const next = getLocaleSafe() === 'ko' ? 'en' : 'ko';
  applyLocale(next);
}

async function selectTheme(themeId) {
  if (!themeId) return;
  settings.theme = themeId;
  saveSettings(settings);
  populateThemeSelect(themeId);
  await applyTheme(themeId);
}

function resolveFilePath(file) {
  if (!file || !isElectron || !window.desktopAPI.getPathForFile) return '';
  try {
    return window.desktopAPI.getPathForFile(file) || '';
  } catch {
    return '';
  }
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatBytes(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** @typedef {{ key: string, vars?: Record<string, string|number>, styleId?: string } | { text: string }} StatusPart */

/** Kept as i18n parts so locale changes can re-render the status bar. */
const statusSnapshot = {
  /** @type {StatusPart} */
  file: { key: 'statusReady' },
  /** @type {StatusPart} */
  format: { text: '—' },
  /** @type {StatusPart} */
  state: { key: 'statusIdle' },
  rate: '1',
  /** @type {string|null} */
  themeSetting: null,
  /** @type {StatusPart} */
  platform: { text: 'Web' }
};

/** @param {string} key @param {Record<string, string|number>} [vars] */
function statusKey(key, vars) {
  return vars ? { key, vars } : { key };
}

/** @param {string|number|null|undefined} value */
function statusText(value) {
  return { text: value == null || value === '' ? '—' : String(value) };
}

/** @param {unknown} value @returns {StatusPart|null} */
function asStatusPart(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value !== null && ('key' in value || 'text' in value)) {
    return /** @type {StatusPart} */ (value);
  }
  return statusText(/** @type {string|number} */ (value));
}

/** @param {StatusPart|null|undefined} part */
function resolveStatusPart(part) {
  if (!part) return '—';
  if ('key' in part && part.key) return t(part.key, part.vars || {});
  if ('text' in part) return part.text ?? '—';
  return '—';
}

function paintStatusBar() {
  if (els.statusFile) els.statusFile.textContent = resolveStatusPart(statusSnapshot.file);
  if (els.statusFormat) els.statusFormat.textContent = resolveStatusPart(statusSnapshot.format);
  if (els.statusState) els.statusState.textContent = resolveStatusPart(statusSnapshot.state);
  if (els.statusRate) els.statusRate.textContent = t('statusSpeed', { n: statusSnapshot.rate });
  if (els.statusTheme) {
    const themeId = statusSnapshot.themeSetting || settings.theme;
    els.statusTheme.textContent = t('statusTheme', { name: themeDisplayName(themeId) });
  }
  if (els.statusPlatform) els.statusPlatform.textContent = resolveStatusPart(statusSnapshot.platform);
}

function setStatus(partial = {}) {
  if (partial.file != null) statusSnapshot.file = asStatusPart(partial.file);
  if (partial.format != null) statusSnapshot.format = asStatusPart(partial.format);
  if (partial.state != null) statusSnapshot.state = asStatusPart(partial.state);
  if (partial.rate != null) statusSnapshot.rate = formatRateLabel(partial.rate);
  if (partial.platform != null) statusSnapshot.platform = asStatusPart(partial.platform);
  if (partial.themeSetting != null) statusSnapshot.themeSetting = String(partial.themeSetting);
  else if (partial.theme != null && typeof partial.theme === 'string') {
    // Prefer theme ids (dark/light/custom:…); ignore already-translated names.
    if (/^(dark|light|ocean|forest|custom:)/.test(partial.theme)) {
      statusSnapshot.themeSetting = partial.theme;
    }
  }
  paintStatusBar();
}

function themeDisplayName(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  if (def.builtin) return t(BUILTIN_THEME_NAME_KEYS[def.id] || 'themeDark');
  return def.name || t('themeDark');
}

function formatRateLabel(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : String(n);
}

function nearestPlaybackRate(rate) {
  const n = Number(rate) || 1;
  return PLAYBACK_RATES.reduce((best, cur) =>
    Math.abs(cur - n) < Math.abs(best - n) ? cur : best
  , PLAYBACK_RATES[0]);
}

function setPlaybackRate(rate, { persist = true, announce = true } = {}) {
  const next = nearestPlaybackRate(rate);
  settings.rate = next;
  els.media.playbackRate = next;
  if (persist) saveSettings(settings);
  if (announce) setStatus({ rate: formatRateLabel(next) });
}

function updatePlayIcons(_playing) {
  /* Transport controls removed — video phone uses Connect / Hang up only. */
}

function syncRangeFill(el) {
  if (!el) return 0;
  const min = Number(el.min);
  const max = Number(el.max);
  const value = Number(el.value);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const cur = Number.isFinite(value) ? value : lo;
  const clamped = Math.min(hi, Math.max(lo, Math.round(cur)));
  const pct = hi === lo ? 0 : Math.min(100, Math.max(0, ((clamped - lo) / (hi - lo)) * 100));
  el.style.setProperty('--fill', `${pct}%`);
  return clamped;
}

function syncSeekBarFill() {
  /* Seek bar removed from UI. */
}

function syncVolumeBarFill() {
  const clamped = syncRangeFill(els.volumeBar);
  const el = els.volumeBar;
  if (!el) return;
  el.setAttribute('aria-valuenow', String(clamped));
  el.setAttribute('aria-valuetext', `${clamped}%`);
  if (els.volumeValue) els.volumeValue.textContent = `${clamped}%`;
}

function updateMuteIcons() {
  const muted = els.media.muted || els.media.volume === 0;
  $('btnMute').querySelector('.icon-vol').classList.toggle('hidden', muted);
  $('btnMute').querySelector('.icon-muted').classList.toggle('hidden', !muted);
  syncVolumeBarFill();
}

function showConnectError(msg) {
  if (!msg) {
    els.connectError.classList.add('hidden');
    els.connectError.textContent = '';
    return;
  }
  els.connectError.textContent = msg;
  els.connectError.classList.remove('hidden');
}

function fillLocaleSelect() {
  const select = $('settingLocale');
  if (!select) return;
  select.innerHTML = '';
  for (const loc of [
    { id: 'en', label: t('langEnglish') },
    { id: 'ko', label: t('langKorean') }
  ]) {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.label;
    select.appendChild(opt);
  }
  select.value = getLocaleSafe();
}

function getLocaleSafe() {
  return settings.locale === 'ko' ? 'ko' : settings.locale === 'en' ? 'en' : resolveInitialLocale(settings.locale);
}

/** @type {{ id: string|null, name: string, scheme: string, vars: Record<string,string> }} */
let themeDraft = { id: null, name: '', scheme: 'dark', vars: {} };

function populateThemeSelect(selected) {
  const select = $('settingTheme');
  if (!select) return;
  const current = selected ?? settings.theme;
  select.innerHTML = '';

  const builtinGroup = document.createElement('optgroup');
  builtinGroup.label = t('builtinGroup');
  for (const theme of BUILTIN_THEMES) {
    const opt = document.createElement('option');
    opt.value = theme.id;
    opt.textContent = t(BUILTIN_THEME_NAME_KEYS[theme.id] || theme.name);
    builtinGroup.appendChild(opt);
  }
  select.appendChild(builtinGroup);

  const customs = loadCustomThemes();
  if (customs.length) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = t('customGroup');
    for (const theme of customs) {
      const opt = document.createElement('option');
      opt.value = `custom:${theme.id}`;
      opt.textContent = theme.name;
      customGroup.appendChild(opt);
    }
    select.appendChild(customGroup);
  }

  const values = [...select.options].map((o) => o.value);
  select.value = values.includes(current) ? current : 'dark';
  updateThemeActionButtons();
}

function updateThemeActionButtons() {
  const value = $('settingTheme')?.value || settings.theme;
  const isCustom = String(value).startsWith('custom:');
  const del = $('btnDeleteTheme');
  if (del) del.hidden = !isCustom;
}

async function applyTheme(themeSetting) {
  const def = applyThemeToDocument(themeSetting);
  syncThemeToOverlays();
  setStatus({ themeSetting: themeSetting });
  if (isElectron && window.desktopAPI.setThemeSource) {
    const source = def.scheme === 'light' ? 'light' : 'dark';
    await window.desktopAPI.setThemeSource(source);
  }
  return def;
}

/**
 * Open a themed dialog.
 * Use modal:false (default) so Chromium does not mark the page inert and pause media.
 * Pass modal:true only when the flow should block the app (e.g. URL entry, errors).
 */
function openThemedDialog(dialogEl, { modal = false } = {}) {
  if (!dialogEl) return;
  syncThemeToOverlays();
  dialogEl.dataset.blocking = modal ? 'true' : 'false';
  // showModal host must stay clear so ::backdrop reveals the window under the card.
  if (modal) {
    dialogEl.style.background = 'transparent';
    dialogEl.style.backgroundColor = 'transparent';
    if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
    else dialogEl.setAttribute('open', '');
    return;
  }
  dialogEl.style.removeProperty('background');
  dialogEl.style.removeProperty('background-color');
  if (typeof dialogEl.show === 'function') dialogEl.show();
  else dialogEl.setAttribute('open', '');
}

function closeTopNonblockingDialog() {
  const open = [...document.querySelectorAll('dialog.modal[open][data-blocking="false"]')];
  const top = open[open.length - 1];
  if (!top) return false;
  if (typeof top.close === 'function') top.close();
  else top.removeAttribute('open');
  return true;
}

function clearSaveProgressCloseTimer() {
  if (saveProgressCloseTimer) {
    clearTimeout(saveProgressCloseTimer);
    saveProgressCloseTimer = 0;
  }
}

function isSaveProgressVisible() {
  return Boolean(els.progressModal && !els.progressModal.hidden);
}

function hideSavedInfo() {
  els.progressSaved?.classList.add('hidden');
  if (els.progressSavedName) els.progressSavedName.textContent = '';
  if (els.progressSavedPath) els.progressSavedPath.textContent = '';
  if (els.progressSavedSize) els.progressSavedSize.textContent = '';
  if (els.progressSavedElapsed) els.progressSavedElapsed.textContent = '';
  els.progressSavedSizeRow?.classList.add('hidden');
  els.progressSavedElapsedRow?.classList.add('hidden');
}

function showSavedInfo({ name = '', path: filePath = '', size = 0, elapsed = '' } = {}) {
  if (!els.progressSaved) return;
  const baseName = name || (filePath ? filePath.split(/[/\\]/).pop() : '') || '—';
  if (els.progressSavedName) els.progressSavedName.textContent = baseName;
  if (els.progressSavedPath) els.progressSavedPath.textContent = filePath || '—';
  if (size > 0) {
    els.progressSavedSizeRow?.classList.remove('hidden');
    if (els.progressSavedSize) els.progressSavedSize.textContent = formatBytes(size);
  } else {
    els.progressSavedSizeRow?.classList.add('hidden');
  }
  if (elapsed) {
    els.progressSavedElapsedRow?.classList.remove('hidden');
    if (els.progressSavedElapsed) els.progressSavedElapsed.textContent = elapsed;
  } else {
    els.progressSavedElapsedRow?.classList.add('hidden');
  }
  els.progressSaved.classList.remove('hidden');
}

function isOpenProgressMode(mode = saveProgressMode) {
  return mode === 'open-rtsp';
}

function showSaveProgress({ mode, title, name }) {
  if (!els.progressModal) return;
  clearSaveProgressCloseTimer();
  saveProgressMode = mode;
  hideSavedInfo();
  if (els.progressTitle) els.progressTitle.textContent = title || t('progressSaving');
  if (els.progressName) {
    els.progressName.textContent = name || '';
    els.progressName.classList.remove('hidden');
  }
  els.progressTrack?.classList.remove('hidden');
  els.progressMeta?.classList.remove('hidden');
  if (els.progressFill) els.progressFill.style.width = '0%';
  // Open (RTSP) uses staged %; save/record may be indeterminate.
  const indeterminate = mode === 'rtsp';
  els.progressTrack?.classList.toggle('is-indeterminate', indeterminate);
  if (els.progressValue) {
    els.progressValue.textContent = mode === 'rtsp' ? '00:00' : isOpenProgressMode(mode) ? '8%' : '0%';
  }
  if (els.progressDetail) els.progressDetail.textContent = '';
  // Save: Stop keeps content. Open: Cancel aborts connect/load.
  if (els.btnProgressCancel) {
    els.btnProgressCancel.hidden = false;
    els.btnProgressCancel.classList.remove('hidden');
    els.btnProgressCancel.disabled = false;
    els.btnProgressCancel.textContent = isOpenProgressMode(mode)
      ? t('progressCancelOpen')
      : t('progressStopSave');
  }
  els.btnProgressClose?.classList.add('hidden');
  if (els.btnProgressClose) els.btnProgressClose.hidden = true;
  syncThemeToOverlays();
  els.progressModal.hidden = false;
}

function setUrlDialogBusy(busy) {
  const play = $('btnConnect');
  if (play) {
    play.disabled = busy;
    play.textContent = busy ? t('progressConnecting') : t('connectAction');
  }
  if (els.connectUrlInput) els.connectUrlInput.readOnly = busy;
}

/**
 * Close the URL modal so the floating progress popup is visible, then show stages.
 * (showModal() dialogs sit above the stage and previously hid open progress.)
 */
function beginOpenStreamProgress({ name = '', detail = '' } = {}) {
  openStreamCancelled = false;
  setUrlDialogBusy(true);
  try {
    if (els.connectModal?.open) els.connectModal.close();
  } catch {
    /* ignore */
  }
  showSaveProgress({
    mode: 'open-rtsp',
    title: t('progressOpeningRtsp'),
    name
  });
  // Determinate steps so the bar moves even when the backend has no byte %.
  updateSaveProgress({
    percent: 8,
    detail: detail || t('progressOpening'),
    indeterminate: false
  });
  updateCallChrome();
}

function updateOpenProgressStage(step, total, detail) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const pct = Math.max(8, Math.min(96, Math.round((step / safeTotal) * 100)));
  updateSaveProgress({
    percent: pct,
    detail: detail || '',
    indeterminate: false
  });
}

function endOpenStreamInFlight() {
  openStreamInFlight = false;
  setUrlDialogBusy(false);
  updateCallChrome();
}

function reopenUrlDialogAfterOpenFailure(url, message) {
  endOpenStreamInFlight();
  closeSaveProgress();
  openConnectDialog(url || '');
  if (message) showConnectError(message);
}

function finishOpenProgress({ ok = true, message = '', autoCloseMs = 900 } = {}) {
  if (!isSaveProgressVisible() || !isOpenProgressMode()) {
    if (!ok && message) {
      /* open UI already gone */
    }
    return;
  }
  clearSaveProgressCloseTimer();
  els.progressTrack?.classList.remove('is-indeterminate');
  els.btnProgressCancel?.classList.add('hidden');
  if (els.btnProgressCancel) els.btnProgressCancel.hidden = true;

  if (!ok) {
    if (els.progressTitle) els.progressTitle.textContent = t('progressOpenFailed');
    hideSavedInfo();
    if (els.progressValue) els.progressValue.textContent = '—';
    if (message && els.progressDetail) els.progressDetail.textContent = message;
    els.btnProgressClose?.classList.remove('hidden');
    if (els.btnProgressClose) {
      els.btnProgressClose.hidden = false;
      els.btnProgressClose.textContent = t('ok');
    }
    saveProgressMode = null;
    return;
  }

  if (els.progressFill) els.progressFill.style.width = '100%';
  if (els.progressValue) els.progressValue.textContent = '100%';
  if (els.progressTitle) els.progressTitle.textContent = t('progressOpenReady');
  if (els.progressDetail) els.progressDetail.textContent = message || '';
  hideSavedInfo();
  els.btnProgressClose?.classList.add('hidden');
  if (els.btnProgressClose) els.btnProgressClose.hidden = true;
  saveProgressMode = null;
  if (autoCloseMs > 0) {
    saveProgressCloseTimer = setTimeout(() => closeSaveProgress(), autoCloseMs);
  } else {
    closeSaveProgress();
  }
}

function updateSaveProgress({ percent = null, elapsed = null, detail = '', indeterminate = null } = {}) {
  if (!isSaveProgressVisible()) return;

  const useIndeterminate =
    indeterminate != null
      ? indeterminate
      : saveProgressMode === 'rtsp' ||
        isOpenProgressMode();
  els.progressTrack?.classList.toggle('is-indeterminate', useIndeterminate);

  if (percent != null && Number.isFinite(percent)) {
    const pct = Math.max(0, Math.min(100, percent));
    if (els.progressFill) els.progressFill.style.width = `${pct}%`;
    if (els.progressValue) els.progressValue.textContent = `${Math.round(pct)}%`;
  } else if (elapsed) {
    if (els.progressValue) els.progressValue.textContent = elapsed;
  }

  if (detail != null && els.progressDetail) {
    els.progressDetail.textContent = detail;
  }
}

function finishSaveProgress({
  ok = true,
  message = '',
  value = null,
  cancelled = false,
  saved = null
} = {}) {
  if (!els.progressModal) return;
  clearSaveProgressCloseTimer();
  els.progressModal.hidden = false;
  els.progressTrack?.classList.remove('is-indeterminate');
  if (cancelled) {
    closeSaveProgress();
    setStatus({ state: statusKey('progressCancelled') });
    return;
  }
  if (ok) {
    if (els.progressFill) els.progressFill.style.width = '100%';
    if (els.progressValue) els.progressValue.textContent = '100%';
    if (els.progressTitle) els.progressTitle.textContent = t('progressDone');
    const info = saved || {};
    const filePath = info.path || message || '';
    const fileName = info.name || (filePath ? filePath.split(/[/\\]/).pop() : '') || '';
    if (els.progressName) {
      els.progressName.textContent = fileName;
      els.progressName.classList.add('hidden');
    }
    if (els.progressDetail) {
      els.progressDetail.textContent = info.size ? formatBytes(info.size) : '';
    }
    showSavedInfo({
      name: fileName,
      path: filePath,
      size: Number(info.size) || 0,
      elapsed: info.elapsed || (value && value !== '100%' ? value : '') || ''
    });
  } else {
    if (els.progressTitle) els.progressTitle.textContent = t('progressFailed');
    hideSavedInfo();
    if (message && els.progressDetail) els.progressDetail.textContent = message;
  }
  els.btnProgressCancel?.classList.add('hidden');
  if (els.btnProgressCancel) els.btnProgressCancel.hidden = true;
  els.btnProgressClose?.classList.remove('hidden');
  if (els.btnProgressClose) {
    els.btnProgressClose.hidden = false;
    els.btnProgressClose.textContent = t('ok');
  }
  saveProgressMode = null;
}

function closeSaveProgress() {
  clearSaveProgressCloseTimer();
  saveProgressMode = null;
  if (els.progressModal) els.progressModal.hidden = true;
}

function renderThemeColorGrid(vars) {
  const grid = $('themeColorGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const item of THEME_EDIT_KEYS) {
    const value = vars[item.key] || '#000000';
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#888888';
    const field = document.createElement('label');
    field.className = 'theme-color-field';
    field.innerHTML = `
      <span></span>
      <div class="color-row">
        <input type="color" data-key="${item.key}" value="${hex}" />
        <input type="text" data-key-text="${item.key}" value="${value}" spellcheck="false" />
      </div>
    `;
    field.querySelector('span').textContent = t(item.labelKey);
    const colorInput = field.querySelector('input[type="color"]');
    const textInput = field.querySelector('input[type="text"]');
    colorInput.addEventListener('input', () => {
      textInput.value = colorInput.value;
      themeDraft.vars[item.key] = colorInput.value;
      previewThemeDraft();
    });
    textInput.addEventListener('change', () => {
      const v = textInput.value.trim();
      themeDraft.vars[item.key] = v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) colorInput.value = v;
      previewThemeDraft();
    });
    grid.appendChild(field);
  }
}

function previewThemeDraft() {
  const vars = ensureDerivedVars(themeDraft.vars);
  const root = document.documentElement;
  root.setAttribute('data-theme', 'custom');
  root.setAttribute('data-color-scheme', themeDraft.scheme);
  root.style.colorScheme = themeDraft.scheme === 'light' ? 'light' : 'dark';
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  syncThemeToOverlays(root);
}

function openThemeEditor() {
  const selected = $('settingTheme').value || settings.theme;
  const def = getThemeDefinition(selected);
  themeDraft = {
    id: def.builtin ? null : def.id,
    name: def.builtin ? themeDisplayName(selected) : def.name,
    scheme: def.scheme || 'dark',
    vars: cloneVarsFromTheme(selected)
  };
  $('themeNameInput').value = themeDraft.name;
  $('themeSchemeSelect').value = themeDraft.scheme;
  renderThemeColorGrid(themeDraft.vars);
  previewThemeDraft();
  openThemedDialog($('themeEditorModal'));
}

function closeThemeEditor(restore = true) {
  $('themeEditorModal').close();
  if (restore) applyTheme(settings.theme);
}

function collectThemeDraftFromForm() {
  themeDraft.name = $('themeNameInput').value.trim() || t('themeNamePh');
  themeDraft.scheme = $('themeSchemeSelect').value === 'light' ? 'light' : 'dark';
  themeDraft.vars = ensureDerivedVars(themeDraft.vars);
  return themeDraft;
}

async function saveThemeDraft({ asNew }) {
  const draft = collectThemeDraftFromForm();
  const id = asNew || !draft.id ? createThemeId() : draft.id;
  const saved = upsertCustomTheme({
    id,
    name: draft.name,
    scheme: draft.scheme,
    vars: draft.vars
  });
  themeDraft.id = saved.id;
  settings.theme = `custom:${saved.id}`;
  saveSettings(settings);
  populateThemeSelect(settings.theme);
  await applyTheme(settings.theme);
  $('themeEditorModal').close();
  setStatus({
    state: asNew || !draft.id ? statusKey('statusThemeCreated') : statusKey('statusThemeSaved')
  });
}

async function deleteSelectedCustomTheme() {
  const value = $('settingTheme').value;
  if (!String(value).startsWith('custom:')) return;
  const id = value.slice('custom:'.length);
  deleteCustomTheme(id);
  settings.theme = 'dark';
  saveSettings(settings);
  populateThemeSelect('dark');
  await applyTheme('dark');
  setStatus({ state: statusKey('statusThemeDeleted') });
}

function applyLocale(locale, { persist = true } = {}) {
  const next = setLocale(locale === 'ko' ? 'ko' : 'en');
  if (persist) {
    settings.locale = next;
    saveSettings(settings);
  }
  applyI18n(document);
  fillLocaleSelect();
  populateThemeSelect(settings.theme);
  updateLocaleToolbarButton();
  updateFitToolbarButton();
  updateFitMenuSelection();
  const playing = Boolean(els.media.src) && !els.media.paused;
  updatePlayIcons(playing);
  setPlaybackRate(settings.rate, { persist: false, announce: true });
  paintStatusBar();
  if ($('connectHint')) {
    $('connectHint').textContent = isElectron ? t('connectHintDesktop') : t('connectHintWeb');
  }
  updateConnectMyIpHint();
  if (appInfo) {
    $('aboutVersion').textContent = t('aboutVersion', { n: appInfo.version });
  }
  updateSaveButton();
  updateCallChrome();
  syncWindowMinWidth();
  return next;
}

function applySettingsToPlayer({ applyVolume = false } = {}) {
  els.media.loop = Boolean(settings.loop);
  if (applyVolume) {
    const vol = Math.min(1, Math.max(0, (Number(settings.startVolume) || 80) / 100));
    els.media.volume = vol;
    els.volumeBar.value = String(Math.round(vol * 100));
  }
  setPlaybackRate(settings.rate, { persist: false, announce: true });
  applyVideoFit(settings.videoFit, { persist: false });
  updateMuteIcons();
  void applyWindowOpacity(settings.windowOpacity, { persist: false });
  if (settings.showLocalPreview) {
    if (localCameraWanted || isLiveCall() || (els.dropHint && !els.dropHint.classList.contains('hidden'))) {
      void startLocalCamera();
    }
  } else {
    stopLocalCamera();
  }
  updateCallChrome();
}

function stepPlaybackRate(delta) {
  const current = nearestPlaybackRate(settings.rate);
  const idx = PLAYBACK_RATES.indexOf(current);
  const nextIdx = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, idx + delta));
  setPlaybackRate(PLAYBACK_RATES[nextIdx]);
}

function fillSettingsForm() {
  fillLocaleSelect();
  populateThemeSelect(settings.theme);
  if ($('settingShowLocalPreview')) {
    $('settingShowLocalPreview').checked = Boolean(settings.showLocalPreview);
  }
  updateOpacityUi(settings.windowOpacity);
  updateMicVolumeUi(settings.micVolume);
  updateStartVolumeUi(settings.startVolume);
}

function clampWindowOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(20, Math.round(n)));
}

function updateOpacityUi(opacityPercent) {
  const value = clampWindowOpacity(opacityPercent);
  const toolbar = $('toolbarOpacityBar');
  const toolbarOut = $('toolbarOpacityValue');
  const setting = $('settingOpacity');
  const settingOut = $('settingOpacityValue');
  if (toolbar) {
    toolbar.value = String(value);
    syncRangeFill(toolbar);
    toolbar.setAttribute('aria-valuetext', `${value}%`);
  }
  if (toolbarOut) toolbarOut.textContent = `${value}%`;
  if (setting) {
    setting.value = String(value);
    syncRangeFill(setting);
    setting.setAttribute('aria-valuetext', `${value}%`);
  }
  if (settingOut) settingOut.textContent = `${value}%`;
}

async function applyWindowOpacity(opacityPercent, { persist = true } = {}) {
  const value = clampWindowOpacity(opacityPercent);
  settings.windowOpacity = value;
  updateOpacityUi(value);
  if (persist) saveSettings(settings);
  if (isElectron && window.desktopAPI?.setWindowOpacity) {
    await window.desktopAPI.setWindowOpacity(value / 100);
  }
}

function readSettingsForm() {
  return {
    locale: $('settingLocale')?.value === 'ko' ? 'ko' : 'en',
    theme: $('settingTheme').value,
    showLocalPreview: Boolean($('settingShowLocalPreview')?.checked),
    windowOpacity: clampWindowOpacity($('settingOpacity')?.value ?? settings.windowOpacity),
    micVolume: clampMicVolume($('settingMicVolume')?.value ?? settings.micVolume),
    startVolume: clampStartVolume($('settingStartVolume')?.value ?? settings.startVolume)
  };
}

function revokeObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

async function loadMedia({
  url,
  name,
  path = null,
  size = null,
  ext = '',
  isRtsp = false,
  isPhone = false,
  rtspUrl = null
} = {}) {
  if (!isRtsp) {
    await stopRtspBridge({ finalizeRecord: true });
  }
  revokeObjectUrl();
  stopRequested = false;
  hidePlaybackOverlay(true);
  currentMediaPath = path;
  currentMediaName = name;
  currentRtspUrl = isRtsp ? (rtspUrl || name || null) : null;
  currentPhoneUrl = isPhone ? (url || name || null) : null;
  els.dropHint.classList.add('hidden');

  const extLabel = isRtsp
    ? 'RTSP'
    : isPhone
      ? 'PHONE'
      : (ext || (name.includes('.') ? name.slice(name.lastIndexOf('.')) : '')).toUpperCase().replace('.', '') || 'MEDIA';
  setStatus({
    file: size ? `${name} (${formatBytes(size)})` : name,
    format: extLabel,
    state: statusKey(isRtsp || isPhone ? 'statusRtspConnecting' : 'statusLoading')
  });

  updateCallChrome();
  if ((isRtsp || isPhone) && settings.showLocalPreview) {
    void startLocalCamera();
  }
  clearPhoneStallWatch();

  // Phone / RTSP live: MSE append of fMP4 fragments (true streaming).
  // Progressive <video src> buffers like a file and is not live.
  if (isPhone || isRtsp) {
    stopLiveEdgeSync();
    try {
      await liveMse.stop();
    } catch {
      /* ignore */
    }
    try {
      await liveMse.start(url);
      try {
        await els.media.play();
      } catch {
        /* autoplay may need a gesture; MSE keeps appending */
      }
      setStatus({
        file: size ? `${name} (${formatBytes(size)})` : name,
        format: extLabel,
        state: statusKey('statusRtspLive')
      });
      updateCallChrome();
    } catch (err) {
      try {
        await liveMse.stop();
      } catch {
        /* ignore */
      }
      if (isPhone) currentPhoneUrl = null;
      if (isRtsp) currentRtspUrl = null;
      updateCallChrome();
      throw err;
    }
    return;
  }

  try {
    await liveMse.stop();
  } catch {
    /* ignore */
  }
  stopLiveEdgeSync();
  els.media.src = url;
  els.media.load();

  if (settings.autoplay) {
    try {
      await els.media.play();
    } catch {
      setStatus({ state: statusKey('statusReadyPlay') });
    }
  }
}

async function repairAndReloadMedia(sourcePath, options = {}) {
  if (!isElectron || !window.desktopAPI?.makeMediaCompatible || !sourcePath) {
    return { ok: false, error: t('statusCompatFailed') };
  }
  setStatus({ state: statusKey('statusCompatConverting'), format: statusKey('statusCodecError') });
  const unsub = window.desktopAPI.onMediaCompatProgress?.((progress) => {
    if (progress?.message) setStatus({ state: progress.message });
  });
  try {
    const result = await window.desktopAPI.makeMediaCompatible(sourcePath, options);
    return result;
  } finally {
    unsub?.();
  }
}

async function handleMediaElementError() {
  const err = els.media.error;
  const detail = mediaErrorDetail(err) || t('statusPlaybackError');
  const msg = err ? `${t('statusPlaybackError')} (${err.code})` : t('statusPlaybackError');

  // During a call: try to recover the stream — never auto-hang-up (use call button).
  if (currentPhoneUrl || phoneSessionActive) {
    void handlePhoneStreamLost();
    return;
  }

  if (currentRtspUrl) {
    const url = currentRtspUrl;
    setStatus({
      state: statusKey('statusRtspFailed'),
      format: 'RTSP'
    });
    showAppError({
      title: t('errorRtspTitle'),
      message: msg,
      detail,
      context: { url }
    });
    await stopRtspBridge();
    return;
  }

  const decodeLike =
    err?.code === 3 ||
    err?.code === 4 ||
    /DECODE|PIPELINE_ERROR_DECODE|DEMUXER_ERROR|not supported/i.test(String(err?.message || ''));

  const priorCompat = currentMediaPath ? compatTriedPaths.get(currentMediaPath) : null;
  const nextCompatMode = !priorCompat ? 'soft' : priorCompat === 'soft' ? 'full' : null;

  if (
    decodeLike &&
    isElectron &&
    currentMediaPath &&
    !compatInFlight &&
    nextCompatMode &&
    window.desktopAPI?.makeMediaCompatible
  ) {
    const originalPath = currentMediaPath;
    const originalName = currentMediaName;
    compatTriedPaths.set(originalPath, nextCompatMode);
    compatInFlight = true;
    try {
      const repaired = await repairAndReloadMedia(originalPath, {
        mode: nextCompatMode,
        force: nextCompatMode === 'full'
      });
      if (repaired?.ok && repaired.url) {
        if (repaired.mode === 'full') compatTriedPaths.set(originalPath, 'full');
        setStatus({ state: statusKey('statusCompatRetry') });
        await loadMedia({
          url: repaired.url,
          name: originalName || repaired.name,
          path: originalPath,
          size: repaired.size,
          ext: repaired.ext || '.mp4'
        });
        setStatus({ state: statusKey('statusCompatDone') });
        return;
      }
      setStatus({ state: statusKey('statusCompatFailed'), format: statusKey('statusCodecError') });
      showAppError({
        title: t('errorMediaTitle'),
        message: t('statusCompatFailed'),
        detail: [detail, t('errorDecodeHint'), repaired?.error || ''].filter(Boolean).join('\n\n'),
        error: err,
        context: {
          src: els.media.currentSrc || els.media.src || '',
          file: originalName || '',
          path: originalPath,
          networkState: els.media.networkState,
          readyState: els.media.readyState
        },
        statusMessage: t('statusCompatFailed')
      });
      return;
    } finally {
      compatInFlight = false;
    }
  }

  setStatus({ state: msg, format: statusKey('statusCodecError') });
  showAppError({
    title: t('errorMediaTitle'),
    message: msg,
    detail: [detail, t('statusCodecError'), decodeLike ? t('errorDecodeHint') : '']
      .filter(Boolean)
      .join('\n'),
    error: err,
    context: {
      src: els.media.currentSrc || els.media.src || '',
      file: currentMediaName || '',
      path: currentMediaPath || '',
      networkState: els.media.networkState,
      readyState: els.media.readyState
    },
    statusMessage: msg
  });
}

async function openMediaDesktop() {
  const result = await window.desktopAPI.openMedia();
  if (!result) return;
  await loadMedia({
    url: result.url,
    name: result.name,
    path: result.path,
    size: result.size,
    ext: result.ext
  });
}

function openMediaWeb() {
  els.webMediaInput.value = '';
  els.webMediaInput.click();
}

async function onWebMediaChosen(e) {
  const files = e.target.files;
  if (!files?.length) return;
  const file = files[0];
  const filePath = resolveFilePath(file);
  if (isElectron && filePath) {
    const result = await window.desktopAPI.openMediaPath(filePath);
    if (result?.ok) {
      await loadMedia({
        url: result.url,
        name: result.name,
        path: result.path,
        size: result.size,
        ext: result.ext
      });
      return;
    }
  }
  revokeObjectUrl();
  currentObjectUrl = URL.createObjectURL(file);
  await loadMedia({
    url: currentObjectUrl,
    name: file.name,
    size: file.size,
    ext: file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  });
}

function togglePlay() {
  // Play / pause is not used — live calls stay streaming.
}

function stopPlayback() {
  // During RTSP recording, Stop finalizes the file and plays it.
  if (rtspRecording) {
    void stopCurrentRtspRecord({ playAfter: true });
    return;
  }
  stopRequested = true;
  if (!els.media.src) return;
  // pause/ended handlers also observe stopRequested — notify once here only.
  els.media.pause();
  if (currentRtspUrl) {
    void (async () => {
      await stopRtspBridge();
      els.media.removeAttribute('src');
      els.media.load();
      els.dropHint?.classList.remove('hidden');
      updateCallChrome();
    })();
  } else {
    els.media.currentTime = 0;
  }
  updatePlayIcons(false);
  setStatus({ state: statusKey('statusStopped') });
  notifyStopped();
  updateCallChrome();
}

async function playSavedLocalFile(filePath) {
  if (!isElectron || !filePath || !window.desktopAPI?.openMediaPath) return false;
  const result = await window.desktopAPI.openMediaPath(filePath);
  if (!result?.ok) {
    showAppError({
      title: t('errorFileTitle'),
      message: result?.error || t('statusFileOpenFail'),
      detail: result?.error || '',
      context: { path: filePath }
    });
    return false;
  }
  await loadMedia({
    url: result.url,
    name: result.name,
    path: result.path,
    size: result.size,
    ext: result.ext
  });
  // Always play after RTSP stop-save, even if autoplay setting is off.
  try {
    await els.media.play();
    updatePlayIcons(true);
    setStatus({ state: statusKey('statusPlaying') });
    notifyPlaying();
  } catch {
    setStatus({ state: statusKey('statusReadyPlay') });
  }
  return true;
}

function seekBy(delta) {
  if (isLiveCall()) return;
  if (!Number.isFinite(els.media.duration)) return;
  els.media.currentTime = Math.min(
    els.media.duration,
    Math.max(0, els.media.currentTime + delta)
  );
}

function seekToPosition(seconds) {
  if (isLiveCall()) return;
  if (!Number.isFinite(els.media.duration)) return;
  els.media.currentTime = Math.min(els.media.duration, Math.max(0, seconds));
}

function seekToPercent(pct) {
  if (isLiveCall()) return;
  const d = els.media.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  seekToPosition((Math.min(100, Math.max(0, pct)) / 100) * d);
}

function getMediaDuration() {
  return els.media.duration;
}

function adjustVolume(delta) {
  els.media.muted = false;
  els.media.volume = Math.min(1, Math.max(0, els.media.volume + delta / 100));
  els.volumeBar.value = String(Math.round(els.media.volume * 100));
  updateMuteIcons();
}

function toggleMute() {
  els.media.muted = !els.media.muted;
  updateMuteIcons();
}

function clearSeekWatchdog() {
  if (seekWatchdog) {
    clearTimeout(seekWatchdog);
    seekWatchdog = 0;
  }
}

function finishSeekInteraction(time) {
  clearSeekWatchdog();
  seeking = false;
  pendingSeekTarget = null;
}

function updateConnectMyIpHint() {
  const el = $('connectMyIpHint');
  if (!el) return;
  if (!isElectron) {
    el.hidden = true;
    return;
  }
  const hints = appInfo?.peerHints?.length
    ? appInfo.peerHints
    : appInfo?.lanAddresses?.length
      ? appInfo.lanAddresses
      : [];
  if (!hints.length) {
    el.hidden = false;
    el.textContent = t('connectMyIpNone');
    return;
  }
  el.hidden = false;
  el.textContent = t('connectMyIp', { ip: hints.join(', ') });
}

/** Record a just-connected address at the top of the recent-calls history. */
function recordRecentCall(rawInput) {
  const addr = String(rawInput || '').trim();
  if (!addr) return;
  const next = normalizeRecentCalls([addr, ...(settings.recentCalls || [])]);
  settings.recentCalls = next;
  saveSettings(settings);
  renderRecentCalls();
}

/** Remove a single address from the recent-calls history. */
function removeRecentCall(addr) {
  const key = String(addr || '').trim().toLowerCase();
  if (!key) return;
  settings.recentCalls = (settings.recentCalls || []).filter(
    (a) => String(a).trim().toLowerCase() !== key
  );
  saveSettings(settings);
  renderRecentCalls();
}

/** Clear the entire recent-calls history. */
function clearRecentCalls() {
  settings.recentCalls = [];
  saveSettings(settings);
  renderRecentCalls();
}

/** Render the recent-calls list inside the connect dialog. */
function renderRecentCalls() {
  const list = els.connectRecentList;
  const wrap = els.connectRecent;
  if (!list || !wrap) return;
  const items = normalizeRecentCalls(settings.recentCalls);
  list.textContent = '';
  if (items.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  for (const addr of items) {
    const li = document.createElement('li');
    li.className = 'connect-recent-item';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'connect-recent-pick';
    pick.textContent = addr;
    pick.title = addr;
    pick.addEventListener('click', () => {
      els.connectUrlInput.value = addr;
      showConnectError('');
      els.connectUrlInput.focus();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'connect-recent-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', t('recentDelete'));
    del.title = t('recentDelete');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecentCall(addr);
    });

    li.append(pick, del);
    list.append(li);
  }
}

function openConnectDialog(prefill = '') {
  showConnectError('');
  els.connectUrlInput.value = prefill || currentPhoneUrl || currentRtspUrl || '';
  updateConnectMyIpHint();
  renderRecentCalls();
  openThemedDialog(els.connectModal, { modal: true });
  queueMicrotask(() => {
    els.connectUrlInput.focus();
    els.connectUrlInput.select();
  });
}

async function playRtspFromInput(rawInput) {
  const url = String(rawInput || '').trim();
  if (!isRtspUrl(url)) {
    showConnectError(t('rtspInvalid'));
    return false;
  }
  if (!isElectron || !window.desktopAPI?.openRtsp) {
    showConnectError(t('rtspDesktopOnly'));
    return false;
  }
  if (openStreamInFlight) {
    setStatus({ state: statusKey('statusOpenInProgress') });
    return false;
  }

  openStreamInFlight = true;
  showConnectError('');
  if (rtspRecording && currentRtspUrl && currentRtspUrl !== url) {
    await finalizeRtspRecordIfAny();
  }
  els.media.pause();
  els.media.removeAttribute('src');
  els.media.load();
  revokeObjectUrl();
  currentMediaPath = null;
  currentMediaName = null;
  stopRequested = false;
  hidePlaybackOverlay(true);
  els.dropHint.classList.add('hidden');

  const label = rtspDisplayName(url);
  beginOpenStreamProgress({
    name: url,
    detail: t('statusRtspConnecting')
  });
  setStatus({
    file: url,
    format: 'RTSP',
    state: statusKey('statusRtspConnecting')
  });

  try {
    updateOpenProgressStage(1, 3, t('statusRtspConnecting'));
    const result = await window.desktopAPI.openRtsp(url);
    if (openStreamCancelled) {
      closeSaveProgress();
      return false;
    }
    if (!result?.ok) {
      const errMsg = result?.error || t('statusRtspFailed');
      reopenUrlDialogAfterOpenFailure(url, errMsg);
      showAppError({
        title: t('errorRtspTitle'),
        message: errMsg,
        detail: result?.error || '',
        context: { url }
      });
      return false;
    }

    updateOpenProgressStage(2, 3, t('progressStartingStream'));
    currentRtspUrl = url;
    await loadMedia({
      url: result.playUrl,
      name: url,
      path: null,
      ext: 'rtsp',
      isRtsp: true,
      rtspUrl: url
    });
    if (openStreamCancelled) {
      await stopRtspBridge();
      closeSaveProgress();
      return false;
    }
    updateSaveButton();
    if (settings.showLocalPreview) {
      void startLocalCamera();
    }
    setStatus({
      file: url,
      format: 'RTSP',
      state: statusKey('statusRtspLive')
    });
    updateOpenProgressStage(3, 3, t('statusRtspLive'));
    finishOpenProgress({ ok: true, message: t('statusRtspLive') });
    updateCallChrome();
    notifyDesktop(t('appTitle'), `${t('notifyCallConnected')}\n${label}`);
    return true;
  } finally {
    endOpenStreamInFlight();
    updateCallChrome();
  }
}

function parsePhoneLiveTarget(rawUrl) {
  try {
    const u = new URL(String(rawUrl || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const port = Number(u.port) || phonePort();
    return { host: canonicalizeLoopbackHost(u.hostname), port, url: u };
  } catch {
    return null;
  }
}

function showIncomingCallDialog(info) {
  pendingIncomingCall = {
    callId: String(info?.callId || ''),
    fromIp: String(info?.fromIp || ''),
    fromLabel: String(info?.fromLabel || info?.fromIp || '')
  };
  const fromEl = $('incomingCallFrom');
  if (fromEl) {
    fromEl.textContent = t('incomingCallFrom', {
      ip: pendingIncomingCall.fromLabel || pendingIncomingCall.fromIp || '—'
    });
  }
  setStatus({ state: statusKey('statusIncomingCall') });
  openThemedDialog(els.incomingCallModal || $('incomingCallModal'), { modal: true });
}

async function respondIncomingCall(accepted) {
  const pending = pendingIncomingCall;
  pendingIncomingCall = null;
  const modal = els.incomingCallModal || $('incomingCallModal');
  if (modal?.open) {
    try {
      modal.close();
    } catch {
      /* ignore */
    }
  }
  if (!pending?.callId || !window.desktopAPI?.phoneRespond) return;

  const result = await window.desktopAPI.phoneRespond(pending.callId, accepted);
  if (!accepted) {
    phoneSessionActive = false;
    setStatus({ state: statusKey('statusCallRejected') });
    updateCallChrome();
    return;
  }
  if (!result?.ok) {
    phoneSessionActive = false;
    setStatus({ state: statusKey('statusCallRejected') });
    updateCallChrome();
    return;
  }

  // Accept grants the caller a /live token — treat as an active call so Hang up works
  // even if we cannot load the caller's video (missing IP, callback fail, etc.).
  phoneSessionActive = true;
  // Prefer socket fromIp (who dialed us). Fall back to advertised IPv4 label.
  const labelIp =
    pending.fromLabel && /^\d{1,3}(\.\d{1,3}){3}$/.test(pending.fromLabel) ? pending.fromLabel : '';
  const hostRaw = pending.fromIp || labelIp;
  const host = canonicalizeLoopbackHost(hostRaw);
  setActivePeer(host, phonePort());
  markPhoneCallActive(true);
  startCallWatch();
  setStatus({
    file: pending.fromLabel || pending.fromIp || t('appTitle'),
    format: 'PHONE',
    state: statusKey('statusRtspLive')
  });
  els.dropHint?.classList.add('hidden');
  updateCallChrome();

  // After Accept, pull the caller's video (they already allowed callback while ringing).
  const playHost = labelIp || host;
  if (playHost && !/^127\./.test(playHost)) {
    const liveUrl = `http://${playHost}:${phonePort()}/live`;
    void playPhoneFromInput(liveUrl, { skipRing: true });
  }
}

/**
 * @param {string} rawUrl
 * @param {{ skipRing?: boolean }} [options]
 */
async function playPhoneFromInput(rawUrl, options = {}) {
  const skipRing = Boolean(options.skipRing);
  const url = String(rawUrl || '').trim();
  if (!isHttpUrl(url)) {
    showConnectError(t('rtspOrIpInvalid'));
    return false;
  }
  if (!isElectron) {
    showConnectError(t('rtspDesktopOnly'));
    return false;
  }
  if (openStreamInFlight) {
    setStatus({ state: statusKey('statusOpenInProgress') });
    return false;
  }

  openStreamInFlight = true;
  showConnectError('');
  if (rtspRecording) await finalizeRtspRecordIfAny();
  await stopRtspBridge({ finalizeRecord: false });
  els.media.pause();
  els.media.removeAttribute('src');
  els.media.load();
  revokeObjectUrl();
  currentMediaPath = null;
  currentMediaName = null;
  currentPhoneUrl = null;
  stopRequested = false;
  hidePlaybackOverlay(true);
  els.dropHint.classList.add('hidden');

  const label = rtspDisplayName(url);
  beginOpenStreamProgress({
    name: label,
    detail: skipRing ? t('statusRtspConnecting') : t('statusWaitingAccept')
  });
  setStatus({
    file: label,
    format: 'PHONE',
    state: statusKey(skipRing ? 'statusRtspConnecting' : 'statusWaitingAccept')
  });

  try {
    if (window.desktopAPI?.setPhonePublish) {
      await window.desktopAPI.setPhonePublish(true);
    }

    let playUrl = url;
    const target = parsePhoneLiveTarget(url);
    if (!skipRing && window.desktopAPI?.phoneRing) {
      updateOpenProgressStage(1, 3, t('statusWaitingAccept'));
      if (!target) {
        throw new Error(t('rtspOrIpInvalid'));
      }
      const ring = await window.desktopAPI.phoneRing(target.host, target.port);
      if (openStreamCancelled) {
        closeSaveProgress();
        return false;
      }
      if (!ring?.accepted) {
        const errKey =
          ring?.error === 'busy'
            ? 'statusCallBusy'
            : ring?.error === 'timeout'
              ? 'statusCallTimeout'
              : 'statusCallRejected';
        const errMsg = t(errKey);
        reopenUrlDialogAfterOpenFailure(url, errMsg);
        setStatus({ state: statusKey(errKey) });
        finishOpenProgress({ ok: false, message: errMsg });
        return false;
      }
      playUrl =
        ring.playUrl ||
        toUiPhonePlayUrl(target.host, target.port, ring.token || '');
      setActivePeer(target.host, target.port);
      phoneSessionActive = true;
      markPhoneCallActive(true);
      startCallWatch();
    } else if (target) {
      // Callback after Accept (or direct play): still use same-origin UI proxy.
      const token = target.url?.searchParams?.get('token') || '';
      playUrl = toUiPhonePlayUrl(target.host, target.port, token);
      if (!activePeer) setActivePeer(target.host, target.port);
      phoneSessionActive = true;
      markPhoneCallActive(true);
      startCallWatch();
    }

    updateOpenProgressStage(2, 3, t('progressStartingStream'));
    await loadMedia({
      url: playUrl,
      name: label,
      path: null,
      ext: 'phone',
      isPhone: true
    });
    if (openStreamCancelled) {
      closeSaveProgress();
      return false;
    }
    if (settings.showLocalPreview) {
      void startLocalCamera();
    }
    setStatus({
      file: label,
      format: 'PHONE',
      state: statusKey('statusRtspLive')
    });
    updateOpenProgressStage(3, 3, t('statusRtspLive'));
    finishOpenProgress({ ok: true, message: t('statusRtspLive') });
    updateCallChrome();
    notifyDesktop(t('appTitle'), `${t('notifyCallConnected')}\n${label}`);
    return true;
  } catch (err) {
    const errMsg = String(err?.message || err || t('statusRtspFailed'));
    reopenUrlDialogAfterOpenFailure(url, errMsg);
    showAppError({
      title: t('errorRtspTitle'),
      message: errMsg,
      detail: errMsg,
      context: { url }
    });
    return false;
  } finally {
    endOpenStreamInFlight();
    updateCallChrome();
  }
}

async function playNetworkFromInput(rawInput) {
  const normalized = normalizeConnectAddress(rawInput);
  if (!normalized) {
    showConnectError(t('rtspOrIpInvalid'));
    setStatus({ state: t('rtspOrIpInvalid') });
    return false;
  }
  let ok = false;
  if (isRtspUrl(normalized)) {
    ok = await playRtspFromInput(normalized);
  } else if (isHttpUrl(normalized)) {
    ok = await playPhoneFromInput(normalized);
  } else {
    showConnectError(t('rtspOrIpInvalid'));
    setStatus({ state: t('rtspOrIpInvalid') });
    return false;
  }
  // Remember the address as typed once the call actually connects.
  if (ok) recordRecentCall(rawInput);
  return ok;
}

async function stopCurrentRtspRecord({ playAfter = false } = {}) {
  if (!isElectron || !window.desktopAPI?.stopRtspRecord) return null;
  setStatus({ state: statusKey('statusRtspRecordStopping') });
  updateSaveProgress({ detail: t('statusRtspRecordStopping'), indeterminate: true });
  if (els.btnProgressCancel) els.btnProgressCancel.disabled = true;
  try {
    // Finalize (keep file). Never discard here — "멈춤" must save up to now.
    const result = await window.desktopAPI.stopRtspRecord({ discard: false });
    rtspRecording = false;
    if (result?.cancelled) {
      finishSaveProgress({ cancelled: true });
      return result;
    }
    if (!result?.ok) {
      finishSaveProgress({
        ok: false,
        message: result?.error || t('statusRtspRecordFailed'),
        value: result?.elapsed || null
      });
      showAppError({
        title: t('errorRtspTitle'),
        message: result?.error || t('statusRtspRecordFailed'),
        detail: result?.error || '',
        context: { url: currentRtspUrl || '', path: result?.path || '' }
      });
      return result;
    }
    setStatus({
      state: statusKey('statusRtspRecordSaved'),
      file: result.path,
      format: 'RTSP'
    });
    finishSaveProgress({
      ok: true,
      value: '100%',
      saved: {
        path: result.path || '',
        name: result.name || '',
        size: result.size || 0,
        elapsed: result.elapsed || ''
      }
    });
    if (playAfter && result.path) {
      await playSavedLocalFile(result.path);
    }
    return result;
  } catch (err) {
    rtspRecording = false;
    finishSaveProgress({ ok: false, message: err?.message || t('statusRtspRecordFailed') });
    showAppError({
      title: t('errorRtspTitle'),
      message: err?.message || t('statusRtspRecordFailed'),
      error: err,
      context: { url: currentRtspUrl || '' }
    });
    return null;
  } finally {
    if (els.btnProgressCancel) els.btnProgressCancel.disabled = false;
    updateSaveButton();
  }
}

async function cancelSaveProgress() {
  if (!isSaveProgressVisible()) return;
  if (els.btnProgressCancel) els.btnProgressCancel.disabled = true;

  // Opening RTSP for playback — cancel connect/load.
  if (isOpenProgressMode()) {
    openStreamCancelled = true;
    if (saveProgressMode === 'open-rtsp') {
      try {
        await stopRtspBridge();
      } catch {
        /* ignore */
      }
      els.media.removeAttribute('src');
      els.media.load();
    }
    closeSaveProgress();
    endOpenStreamInFlight();
    setStatus({ state: statusKey('progressCancelled') });
    return;
  }

  // RTSP "멈춤" → save what was recorded and play it.
  if (saveProgressMode === 'rtsp' || rtspRecording) {
    await stopCurrentRtspRecord({ playAfter: true });
  }
}

async function startCurrentRtspRecord(url = currentRtspUrl) {
  if (!url || !isRtspUrl(url)) {
    openConnectDialog(url || '');
    return;
  }
  if (!isElectron || !window.desktopAPI?.startRtspRecord) {
    setStatus({ state: statusKey('rtspDesktopOnly') });
    return;
  }
  if (rtspRecording) {
    await stopCurrentRtspRecord();
    return;
  }

  setStatus({ state: statusKey('statusRtspRecordStarting') });
  try {
    const result = await window.desktopAPI.startRtspRecord({ url });
    if (result?.cancelled) {
      setStatus({ state: statusKey('statusDownloadCancelled') });
      return;
    }
    if (!result?.ok) {
      showAppError({
        title: t('errorRtspTitle'),
        message: result?.error || t('statusRtspRecordFailed'),
        detail: result?.error || '',
        context: { url }
      });
      return;
    }
    rtspRecording = true;
    showSaveProgress({
      mode: 'rtsp',
      title: t('progressRecording'),
      name: result.path || url
    });
    updateSaveProgress({
      elapsed: '00:00',
      detail: t('progressElapsed', { time: '00:00' }),
      indeterminate: true
    });
    setStatus({
      state: statusKey('statusRtspRecording', { time: '00:00' }),
      file: result.path || url,
      format: 'RTSP'
    });
    notifyDesktop(t('appTitle'), t('notifyRecordingStarted'));
  } catch (err) {
    rtspRecording = false;
    showAppError({
      title: t('errorRtspTitle'),
      message: err?.message || t('statusRtspRecordFailed'),
      error: err,
      context: { url }
    });
  } finally {
    updateSaveButton();
  }
}

async function saveCurrentMedia() {
  if (rtspRecording) {
    // Toolbar Save / Ctrl+S while recording → 멈춤: keep file and play it.
    await stopCurrentRtspRecord({ playAfter: true });
    return;
  }
  if (currentRtspUrl) {
    await startCurrentRtspRecord(currentRtspUrl);
    return;
  }
  openConnectDialog();
}

function syncMaximizeButton(maximized) {
  const btn = $('btnMaximize');
  if (!btn) return;
  btn.textContent = maximized ? '❐' : '□';
  btn.setAttribute('data-tooltip', maximized ? t('restore') : t('maximize'));
  btn.setAttribute('data-i18n-tooltip', maximized ? 'restore' : 'maximize');
  btn.setAttribute('aria-label', maximized ? t('restore') : t('maximize'));
}

function isToolbarDragTarget(target) {
  if (!(target instanceof Element)) return false;
  // Interactive controls keep their own pointer behavior.
  if (
    target.closest?.(
      'button, input, select, a, label, textarea, .popup-menu, .toolbar-opacity, .window-controls'
    )
  ) {
    return false;
  }
  return Boolean(target.closest?.('#toolbar'));
}

function bindToolbarWindowDrag() {
  const toolbar = $('toolbar');
  if (!toolbar || !isElectron || !window.desktopAPI?.beginWindowDrag) return;

  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    window.desktopAPI.updateWindowDrag?.(e.screenX, e.screenY);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    toolbar.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', endDrag, true);
    window.removeEventListener('pointercancel', endDrag, true);
    window.desktopAPI.endWindowDrag?.();
  };

  toolbar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // Empty chrome only — brand, spacer, and gaps between controls.
    if (!isToolbarDragTarget(e.target)) return;
    dragging = true;
    toolbar.classList.add('is-dragging');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    try {
      toolbar.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    window.desktopAPI.beginWindowDrag();
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    e.preventDefault();
  });
}

function updateToolbarBrand(info) {
  const el = $('toolbarBrandText');
  if (!el) return;
  const version = info?.version || '1.0.0';
  el.textContent = 'MyVideoPhone';
  el.dataset.version = version;
  const brand = $('toolbarBrand');
  if (brand) brand.title = `MyVideoPhone V${version}`;
  syncWindowMinWidth();
}

function bindWindowControls() {
  const opacity = $('toolbarOpacity');
  const opacityField = $('settingOpacityField');

  if (!isElectron) {
    if (opacity) opacity.hidden = true;
    if (opacityField) opacityField.hidden = true;
    return;
  }

  document.documentElement.classList.add('is-electron');
  document.body.classList.add('is-electron');
  if (opacity) opacity.hidden = false;
  if (opacityField) opacityField.hidden = false;
  const controls = $('windowControls');
  if (controls) {
    controls.hidden = false;
    controls.style.display = 'flex';
  }

  $('btnMinimize')?.addEventListener('click', () => window.desktopAPI.minimize());
  $('btnMaximize')?.addEventListener('click', async () => {
    const maximized = await window.desktopAPI.maximizeToggle();
    syncMaximizeButton(maximized);
  });
  $('btnClose')?.addEventListener('click', () => {
    // Turn off webcam immediately when hiding to the system tray.
    stopLocalCamera();
    window.desktopAPI.close();
  });

  window.desktopAPI.onWindowVisibility?.((state) => {
    if (!state?.visible) {
      stopLocalCamera();
      // Release mic hardware in tray; keep the on/off preference.
      if (localMicStream) {
        for (const track of localMicStream.getTracks()) {
          try {
            track.stop();
          } catch {
            /* ignore */
          }
        }
        localMicStream = null;
      }
      updateMicButton();
      return;
    }
    // Restore preview only when the window returns during an active call UI.
    if (
      settings.showLocalPreview &&
      (isLiveCall() || (els.dropHint && !els.dropHint.classList.contains('hidden')))
    ) {
      void startLocalCamera();
    }
    if (localMicEnabled) {
      void setLocalMicEnabled(true);
    }
  });

  // Double-click empty toolbar chrome to maximize / restore (like a title bar).
  $('toolbar')?.addEventListener('dblclick', async (e) => {
    if (!isToolbarDragTarget(e.target)) return;
    e.preventDefault();
    const maximized = await window.desktopAPI.maximizeToggle();
    syncMaximizeButton(maximized);
  });

  bindToolbarWindowDrag();

  const onOpacityInput = (e) => {
    void applyWindowOpacity(e.target.value, { persist: true });
  };
  $('toolbarOpacityBar')?.addEventListener('input', onOpacityInput);
  $('settingOpacity')?.addEventListener('input', onOpacityInput);

  window.desktopAPI.isMaximized?.().then((maximized) => syncMaximizeButton(Boolean(maximized)));
  window.desktopAPI.onWindowState?.((state) => {
    if (state.maximized != null) syncMaximizeButton(Boolean(state.maximized));
  });

  syncWindowMinWidth();
}

function bindDragDrop() {
  const wrap = els.videoWrap;
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((type) => {
    wrap.addEventListener(type, prevent);
  });
  wrap.addEventListener('dragenter', () => wrap.classList.add('dragover'));
  wrap.addEventListener('dragover', () => wrap.classList.add('dragover'));
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
  wrap.addEventListener('drop', async (e) => {
    wrap.classList.remove('dragover');
    const text = e.dataTransfer?.getData('text') || e.dataTransfer?.getData('text/uri-list') || '';
    if (text && normalizeConnectAddress(text)) {
      await playNetworkFromInput(text.trim());
      return;
    }
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const media = files.find((f) => /^(video|audio)\//.test(f.type) || /\.(mp4|mkv|webm|mov|avi|mp3|aac|m4a|wav|flac|opus|ogg|hevc|h265)$/i.test(f.name));
    if (!media) {
      setStatus({ state: statusKey('statusUnsupportedDrop') });
      return;
    }
    const filePath = resolveFilePath(media);
    if (isElectron && filePath) {
      const result = await window.desktopAPI.openMediaPath(filePath);
      if (result?.ok) {
        await loadMedia({
          url: result.url,
          name: result.name,
          path: result.path,
          size: result.size,
          ext: result.ext
        });
        return;
      }
    }
    revokeObjectUrl();
    currentObjectUrl = URL.createObjectURL(media);
    await loadMedia({
      url: currentObjectUrl,
      name: media.name,
      size: media.size,
      ext: media.name.includes('.') ? media.name.slice(media.name.lastIndexOf('.')) : ''
    });
  });
}

function bindMediaEvents() {
  els.media.addEventListener('loadedmetadata', () => {
    els.media.playbackRate = nearestPlaybackRate(settings.rate);
    updateActualMediaSize();
    setStatus({ state: statusKey('statusReady') });
  });
  els.media.addEventListener('ratechange', () => {
    const rate = nearestPlaybackRate(els.media.playbackRate);
    if (rate !== nearestPlaybackRate(settings.rate)) {
      setPlaybackRate(rate, { persist: true, announce: true });
    }
  });
  els.media.addEventListener('play', () => {
    updatePlayIcons(true);
    notifyPlaying();
    if (currentPhoneUrl || currentRtspUrl) {
      setStatus({ state: statusKey('statusRtspLive') });
      return;
    }
    setStatus({ state: statusKey('statusPlaying') });
  });
  els.media.addEventListener('pause', () => {
    updatePlayIcons(false);
    if (els.media.ended) return;
    if (stopRequested || hangUpInFlight) {
      setStatus({ state: statusKey('statusStopped') });
      return;
    }
    // Live stream: resume immediately — pause is not a user action.
    if (currentPhoneUrl || currentRtspUrl || phoneSessionActive) {
      els.media.play().catch(() => {});
      return;
    }
    setStatus({ state: statusKey('statusPaused') });
  });
  els.media.addEventListener('ended', () => {
    updatePlayIcons(false);
    if (hangUpInFlight) return;
    // Peer closed the live HTTP stream (or publisher soft-restarted for mic).
    if (currentPhoneUrl || phoneSessionActive) {
      void handlePhoneStreamLost();
      return;
    }
    if (currentRtspUrl) {
      els.media.play().catch(() => {});
      return;
    }
    setStatus({ state: statusKey('statusEnded') });
    notifyOverlayOnce('stopped', { hold: false, label: t('overlayEnded') });
  });
  els.media.addEventListener('waiting', () => {
    setStatus({ state: statusKey('statusBuffering') });
    if (currentPhoneUrl || phoneSessionActive) armPhoneStallWatch();
  });
  els.media.addEventListener('playing', () => {
    stopRequested = false;
    if (currentPhoneUrl || phoneSessionActive) {
      clearPhoneStallWatch();
      chaseLiveEdge(els.media);
      setStatus({ state: statusKey('statusRtspLive') });
      return;
    }
    if (currentRtspUrl) {
      chaseLiveEdge(els.media);
      setStatus({ state: statusKey('statusRtspLive') });
      return;
    }
    setStatus({ state: statusKey('statusPlaying') });
  });
  els.media.addEventListener('progress', () => {
    if (currentPhoneUrl || currentRtspUrl) chaseLiveEdge(els.media);
  });
  els.media.addEventListener('timeupdate', () => {
    if (currentPhoneUrl || phoneSessionActive) clearPhoneStallWatch();
  });
  els.media.addEventListener('error', () => {
    void handleMediaElementError();
  });
  els.media.addEventListener('seeking', () => {
    // Keep UI locked while the engine is jumping.
    seeking = true;
  });
  els.media.addEventListener('seeked', () => {
    finishSeekInteraction(els.media.currentTime);
  });
  els.media.addEventListener('volumechange', () => {
    if (!seeking) els.volumeBar.value = String(Math.round((els.media.muted ? 0 : els.media.volume) * 100));
    updateMuteIcons();
  });
}

function bindToolbar() {
  els.btnControlOpen?.addEventListener('click', () => onControlCallClick());
  els.btnLocale?.addEventListener('click', () => {
    toggleLocale();
  });
  els.btnFit?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFitMenu();
  });
  els.fitList?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-fit]');
    if (!btn) return;
    e.stopPropagation();
    closeFitMenu();
    applyVideoFit(btn.dataset.fit, { announce: true });
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.fit-wrap')) return;
    closeToolbarMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeToolbarMenus();
  });
  els.btnLocalCamera?.addEventListener('click', () => {
    void toggleLocalCamera();
  });
  els.btnDropConnect?.addEventListener('click', (e) => {
    e.stopPropagation();
    openConnectDialog();
  });
  els.btnMic?.addEventListener('click', () => {
    void toggleLocalMic();
  });
  $('btnIncomingAccept')?.addEventListener('click', (e) => {
    e.preventDefault();
    void respondIncomingCall(true);
  });
  $('btnIncomingReject')?.addEventListener('click', (e) => {
    e.preventDefault();
    void respondIncomingCall(false);
  });
  els.incomingCallModal?.addEventListener('cancel', (e) => {
    // Esc → reject
    e.preventDefault();
    void respondIncomingCall(false);
  });
  window.desktopAPI?.onIncomingCall?.((info) => {
    showIncomingCallDialog(info || {});
  });
  // Main asks us to start/stop capturing our camera for the outgoing publish.
  window.desktopAPI?.onPhonePublishSignal?.((action, generation) => {
    if (action === 'start') void startPublishCapture(generation);
    else if (action === 'stop') stopPublishCapture();
  });
  window.desktopAPI?.onPhonePeerLeft?.((info) => {
    // Only explicit peer hang-up (/bye) ends the call.
    // viewer-left (mic mute / brief reconnect) must not — especially while video shows.
    if (info?.reason === 'bye') {
      forceReleasePhoneCallUi(true);
      void endCallFromRemote();
      return;
    }
    if (isPhoneVideoPresenting()) return;
    // No video and peer stopped watching — treat as remote end.
    forceReleasePhoneCallUi(true);
    void endCallFromRemote();
  });
  els.btnProgressCancel?.addEventListener('click', () => {
    void cancelSaveProgress();
  });
  els.btnProgressClose?.addEventListener('click', () => closeSaveProgress());
  $('btnMute').addEventListener('click', () => {
    toggleMute();
  });
  $('btnSettings').addEventListener('click', async () => {
    if (isElectron && window.desktopAPI?.getAppInfo) {
      try {
        appInfo = await window.desktopAPI.getAppInfo();
      } catch {
        /* ignore */
      }
    }
    fillSettingsForm();
    openThemedDialog(els.settingsModal);
  });
  $('btnAbout').addEventListener('click', () => openThemedDialog(els.aboutModal));

  els.volumeBar.addEventListener('input', () => {
    const percent = Number(els.volumeBar.value);
    syncVolumeBarFill();
    els.media.volume = percent / 100;
    els.media.muted = percent === 0;
    updateMuteIcons();
  });

  els.webMediaInput.addEventListener('change', onWebMediaChosen);

  $('btnConnect').addEventListener('click', async () => {
    if (openStreamInFlight) {
      setStatus({ state: statusKey('statusOpenInProgress') });
      return;
    }
    setUrlDialogBusy(true);
    try {
      await playNetworkFromInput(els.connectUrlInput.value);
    } finally {
      if (!openStreamInFlight) setUrlDialogBusy(false);
    }
  });
  els.connectUrlInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (openStreamInFlight) {
        setStatus({ state: statusKey('statusOpenInProgress') });
        return;
      }
      await playNetworkFromInput(els.connectUrlInput.value);
    }
  });
  els.btnClearRecent?.addEventListener('click', () => clearRecentCalls());

  $('settingLocale')?.addEventListener('change', () => {
    applyLocale($('settingLocale').value);
  });
  $('settingTheme').addEventListener('change', async () => {
    updateThemeActionButtons();
    await selectTheme($('settingTheme').value);
  });
  $('btnEditTheme').addEventListener('click', () => openThemeEditor());
  $('btnDeleteTheme').addEventListener('click', () => deleteSelectedCustomTheme());
  $('btnCloseThemeEditor').addEventListener('click', () => closeThemeEditor(true));
  $('btnThemeSave').addEventListener('click', (e) => {
    e.preventDefault();
    saveThemeDraft({ asNew: false });
  });
  $('btnThemeSaveAs').addEventListener('click', (e) => {
    e.preventDefault();
    saveThemeDraft({ asNew: true });
  });
  $('themeSchemeSelect').addEventListener('change', () => {
    themeDraft.scheme = $('themeSchemeSelect').value === 'light' ? 'light' : 'dark';
    previewThemeDraft();
  });
  $('themeEditorModal').addEventListener('cancel', (e) => {
    e.preventDefault();
    closeThemeEditor(true);
  });

  const onMicVolumeInput = () => {
    const value = clampMicVolume($('settingMicVolume')?.value);
    updateMicVolumeUi(value);
    settings.micVolume = value;
    applyLocalMicGain();
  };
  const onStartVolumeInput = () => {
    const value = clampStartVolume($('settingStartVolume')?.value);
    updateStartVolumeUi(value);
  };
  $('settingMicVolume')?.addEventListener('input', onMicVolumeInput);
  $('settingStartVolume')?.addEventListener('input', onStartVolumeInput);

  $('btnSaveSettings').addEventListener('click', async (e) => {
    e.preventDefault();
    settings = {
      ...settings,
      ...readSettingsForm(),
      // Preserve fields not present on the settings form.
      videoFit: normalizeVideoFit(settings.videoFit)
    };
    saveSettings(settings);
    applyLocale(settings.locale, { persist: false });
    await applyTheme(settings.theme);
    applySettingsToPlayer({ applyVolume: true });
    await applyMicVolume(settings.micVolume, { persist: false, syncPhone: true });
    els.settingsModal.close();
    setStatus({ state: statusKey('statusSettingsSaved') });
  });

  $('btnResetSettings').addEventListener('click', async () => {
    // Keep language as-is; reset must not switch locale.
    const keptLocale = getLocaleSafe();
    settings = resetSettings({ locale: keptLocale });
    applyLocale(settings.locale, { persist: false });
    fillSettingsForm();
    await applyTheme(settings.theme);
    applySettingsToPlayer({ applyVolume: true });
    await applyMicVolume(settings.micVolume, { persist: false, syncPhone: true });
    setStatus({ state: statusKey('statusSettingsReset') });
  });

  $('aboutEmail').addEventListener('click', (e) => {
    if (isElectron) {
      e.preventDefault();
      window.desktopAPI.openExternal('mailto:knix008@naver.com');
    }
  });
}

function focusPlaybackSurface() {
  const wrap = els.videoWrap;
  if (!wrap) return;
  if (!wrap.hasAttribute('tabindex')) wrap.setAttribute('tabindex', '-1');
  try {
    wrap.focus({ preventScroll: true });
  } catch {
    wrap.focus?.();
  }
}

function bindKeyboard() {
  // Keep Space (and other keys) on the app, not on stray embedded controls.
  els.videoWrap?.setAttribute('tabindex', '-1');
  els.stage?.addEventListener('pointerdown', () => {
    // Defer so click handlers still run, then reclaim focus for Space.
    queueMicrotask(() => focusPlaybackSurface());
  });
  els.controlBar?.addEventListener('pointerup', (e) => {
    if (isEditableTarget(e.target)) return;
    queueMicrotask(() => focusPlaybackSurface());
  });

  document.addEventListener(
    'keydown',
    (e) => {
      // Always allow Escape to dismiss overlays even when typing in non-modal UI.
      if (e.key === 'Escape') {
        if (!els.fitMenu?.hidden) {
          e.preventDefault();
          closeToolbarMenus();
          return;
        }
        if (closeTopNonblockingDialog()) {
          e.preventDefault();
          return;
        }
        if (canHangUpCall()) {
          e.preventDefault();
          void hangUpCall();
          return;
        }
        return;
      }

      if (isEditableTarget(e.target) || isModalOpen()) return;
      if (e.altKey) return;

      const mod = e.ctrlKey || e.metaKey;
      const step = Number(settings.seekStep) || 10;
      const key = e.key;
      const code = e.code;

      // Media keys (keyboards / headsets) — no play/pause for video phone.
      if (key === 'MediaPlayPause') {
        e.preventDefault();
        return;
      }
      if (key === 'MediaStop') {
        e.preventDefault();
        if (canHangUpCall()) void hangUpCall();
        else stopPlayback();
        return;
      }
      if (key === 'MediaTrackPrevious' || key === 'MediaRewind') {
        e.preventDefault();
        seekBy(-step);
        return;
      }
      if (key === 'MediaTrackNext' || key === 'MediaFastForward') {
        e.preventDefault();
        seekBy(step);
        return;
      }
      if (key === 'AudioVolumeMute') {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (key === 'AudioVolumeUp') {
        e.preventDefault();
        adjustVolume(5);
        return;
      }
      if (key === 'AudioVolumeDown') {
        e.preventDefault();
        adjustVolume(-5);
        return;
      }

      if (mod) {
        const k = key.toLowerCase();
        if (k === 'y') {
          e.preventDefault();
          openConnectDialog();
          return;
        }
        if (k === 's' && (currentRtspUrl || rtspRecording)) {
          e.preventDefault();
          saveCurrentMedia();
          return;
        }
        if (k === ',' || code === 'Comma') {
          e.preventDefault();
          fillSettingsForm();
          openThemedDialog(els.settingsModal);
          return;
        }
        return;
      }

      // Digit keys → seek to 0%…90%
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        seekToPercent(Number(key) * 10);
        return;
      }

      switch (key) {
        case 's':
        case 'S':
        case '.':
          e.preventDefault();
          if (canHangUpCall()) void hangUpCall();
          else stopPlayback();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekBy(-step);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekBy(step);
          break;
        case 'Home':
          e.preventDefault();
          seekToPosition(0);
          break;
        case 'End': {
          e.preventDefault();
          const d = getMediaDuration();
          if (Number.isFinite(d) && d > 0) seekToPosition(d);
          break;
        }
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(5);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-5);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case '[':
        case '<':
          e.preventDefault();
          stepPlaybackRate(-1);
          break;
        case ']':
        case '>':
          e.preventDefault();
          stepPlaybackRate(1);
          break;
        default:
          break;
      }
    },
    true
  );
}

async function init() {
  // migrate legacy system theme / locale
  if (settings.theme === 'system') {
    settings.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    saveSettings(settings);
  }
  if (!settings.locale || settings.locale === 'auto') {
    settings.locale = resolveInitialLocale('auto');
    saveSettings(settings);
  }

  applyLocale(settings.locale, { persist: false });

  // One document-level tooltip host — nested roots were hiding tips via mouseleave races.
  initTooltips(document);

  window.addEventListener('error', (event) => {
    showAppError({
      title: t('errorGenericTitle'),
      message: event.message || t('errorDefaultMessage'),
      detail: [
        event.message || '',
        event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '',
        event.error?.stack || ''
      ].filter(Boolean).join('\n'),
      error: event.error || event.message,
      context: { type: 'window.error' }
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    showAppError({
      title: t('errorGenericTitle'),
      message: reason?.message || String(reason || t('errorDefaultMessage')),
      error: reason,
      context: { type: 'unhandledrejection' }
    });
  });

  bindWindowControls();
  bindToolbar();
  bindMediaEvents();
  bindDragDrop();
  bindKeyboard();

  populateThemeSelect(settings.theme);
  await applyTheme(settings.theme);
  applySettingsToPlayer({ applyVolume: true });
  updateMicVolumeUi(settings.micVolume);
  updateStartVolumeUi(settings.startVolume);
  updatePlayIcons(false);

  if (isElectron) {
    appInfo = await window.desktopAPI.getAppInfo();
    updateConnectMyIpHint();
    updateToolbarBrand(appInfo);
    await syncPhoneMicToMain();
    // Publish camera on the fixed LAN port so peers can dial with IP only.
    try {
      await window.desktopAPI.setPhonePublish?.(true);
    } catch {
      /* ignore */
    }
    if (settings.showLocalPreview) {
      localCameraWanted = true;
      void startLocalCamera();
    }
    $('aboutName').textContent = appInfo.name;
    $('aboutVersion').textContent = t('aboutVersion', { n: appInfo.version });
    setStatus({
      platform: `${appInfo.platform}/${appInfo.arch}`,
      file: statusKey('statusReady'),
      state: statusKey('statusIdle')
    });
    window.desktopAPI.onRtspRecordProgress?.((progress) => {
      if (!progress) return;
      if (progress.phase === 'recording' || progress.phase === 'started') {
        rtspRecording = true;
        updateSaveButton();
        if (!isSaveProgressVisible() || saveProgressMode !== 'rtsp') {
          showSaveProgress({
            mode: 'rtsp',
            title: t('progressRecording'),
            name: progress.path || currentRtspUrl || ''
          });
        }
        updateSaveProgress({
          elapsed: progress.elapsed || '00:00',
          detail: t('progressElapsed', { time: progress.elapsed || '00:00' }),
          indeterminate: true
        });
        setStatus({
          state: statusKey('statusRtspRecording', { time: progress.elapsed || '00:00' }),
          file: progress.path || currentRtspUrl || undefined,
          format: 'RTSP'
        });
        return;
      }
      if (progress.phase === 'stopping') {
        setStatus({ state: statusKey('statusRtspRecordStopping') });
        updateSaveProgress({ detail: t('statusRtspRecordStopping'), indeterminate: true });
        return;
      }
      if (progress.phase === 'cancelled') {
        rtspRecording = false;
        updateSaveButton();
        finishSaveProgress({ cancelled: true });
        return;
      }
      if (progress.phase === 'done') {
        rtspRecording = false;
        updateSaveButton();
        if (progress.path) {
          setStatus({
            state: statusKey('statusRtspRecordSaved'),
            file: progress.path,
            format: 'RTSP'
          });
          notifyDesktop(
            t('appTitle'),
            `${t('notifyRecordingSaved')}\n${progress.name || progress.path}`
          );
        }
        if (isSaveProgressVisible()) {
          finishSaveProgress({
            ok: true,
            value: '100%',
            saved: {
              path: progress.path || '',
              name: progress.name || '',
              size: progress.size || 0,
              elapsed: progress.elapsed || ''
            }
          });
        }
        return;
      }
      if (progress.phase === 'error') {
        rtspRecording = false;
        updateSaveButton();
        if (isSaveProgressVisible()) {
          finishSaveProgress({
            ok: false,
            message: progress.error || t('statusRtspRecordFailed')
          });
        }
        showAppError({
          title: t('errorRtspTitle'),
          message: progress.error || t('statusRtspRecordFailed'),
          detail: progress.error || '',
          context: { url: currentRtspUrl || '', path: progress.path || '' }
        });
      }
    });
  } else {
    updateToolbarBrand({ version: '1.0.0' });
    setStatus({ platform: 'Web', file: statusKey('statusReady'), state: statusKey('statusIdle') });
  }

  updateSaveButton();
  syncWindowMinWidth();
  // Re-measure after fonts settle (locale labels / brand text width).
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => syncWindowMinWidth());
  }
  updateCallChrome();
  if (settings.showLocalPreview) {
    localCameraWanted = true;
    void startLocalCamera();
  }

  // OS file association / "Open with" / second-instance handoff
  window.desktopAPI?.onOpenMediaPaths?.(async (paths) => {
    const list = Array.isArray(paths) ? paths : [];
    for (const filePath of list) {
      if (!filePath || !isElectron) continue;
      const result = await window.desktopAPI.openMediaPath(filePath);
      if (result?.ok) {
        await loadMedia({
          url: result.url,
          name: result.name,
          path: result.path,
          size: result.size,
          ext: result.ext
        });
        break;
      }
    }
  });

  // Paste IP / RTSP / phone URL anywhere (except inputs)
  window.addEventListener('paste', async (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const text = e.clipboardData?.getData('text') || '';
    if (normalizeConnectAddress(text)) {
      e.preventDefault();
      await playNetworkFromInput(text.trim());
    }
  });

}

init();

import { audioBufferToWav, saveWav, openAudioFilesWeb } from './audio/exporter.js';
import { getExtension, isSupportedAudioFile } from './audio/formats.js';
import I18n from './i18n/i18n.js';

const impulseCache = new Map();
const UI_DENSITY_STORAGE_KEY = 'sms_ui_density';
const THEME_STORAGE_KEY = 'sms_theme';
const FX_PRESETS = {
  flat: {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    compThreshold: -18,
    compRatio: 2,
    reverbMix: 0.08,
    reverbDecay: 1.8,
    reverbPreDelay: 0.02
  },
  vocal: {
    lowGain: -2,
    midGain: 2.8,
    highGain: 3,
    compThreshold: -24,
    compRatio: 3.2,
    reverbMix: 0.14,
    reverbDecay: 1.5,
    reverbPreDelay: 0.03
  },
  drums: {
    lowGain: 3.5,
    midGain: -1.2,
    highGain: 1.8,
    compThreshold: -16,
    compRatio: 5,
    reverbMix: 0.1,
    reverbDecay: 1.2,
    reverbPreDelay: 0.01
  },
  ambient: {
    lowGain: 1.5,
    midGain: -1,
    highGain: 2,
    compThreshold: -20,
    compRatio: 2.4,
    reverbMix: 0.38,
    reverbDecay: 4.4,
    reverbPreDelay: 0.06
  }
};

const state = {
  tracks: [],
  selectedTrackId: null,
  isPlaying: false,
  recArmed: false,
  punchEnabled: false,
  cueMonitor: false,
  loopIn: null,
  loopOut: null,
  loopJumping: false,
  playStartContextTime: 0,
  playStartOffset: 0,
  duration: 0,
  meterHoldL: 0,
  meterHoldR: 0,
  clipHoldUntil: 0,
  trackMeterRuntime: new Map(),
  clips: [],
  automationCurves: {
    trackVolume: [
      { x: 0, y: 0.75 },
      { x: 1, y: 0.75 }
    ],
    trackPan: [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 }
    ],
    master: [
      { x: 0, y: 0.75 },
      { x: 1, y: 0.75 }
    ]
  },
  automationTarget: 'trackVolume',
  automationCurveMode: 'linear',
  automationDragIndex: -1,
  clipSnapEnabled: true,
  clipSnapDivisions: 32,
  autoCrossfadeEnabled: true,
  autoCrossfadeSec: 0.16,
  dockVisible: true,
  uiDensity: 'studio',
  sourceNodes: [],
  rafId: 0,
  draggedTrackId: null
};

const engine = {
  ctx: null,
  analyser: null,
  masterGain: null,
  masterLimiter: null,
  cueGain: null
};

const els = {
  btnImport: document.getElementById('btnImport'),
  btnAddTone: document.getElementById('btnAddTone'),
  btnSaveProject: document.getElementById('btnSaveProject'),
  btnLoadProject: document.getElementById('btnLoadProject'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnStop: document.getElementById('btnStop'),
  btnRecArm: document.getElementById('btnRecArm'),
  btnPunch: document.getElementById('btnPunch'),
  btnCueMonitor: document.getElementById('btnCueMonitor'),
  btnLoopIn: document.getElementById('btnLoopIn'),
  btnLoopOut: document.getElementById('btnLoopOut'),
  btnExport: document.getElementById('btnExport'),
  btnToggleDock: document.getElementById('btnToggleDock'),
  btnSnapGrid: document.getElementById('btnSnapGrid'),
  btnAutoCrossfade: document.getElementById('btnAutoCrossfade'),
  btnCurveMode: document.getElementById('btnCurveMode'),
  btnUiDensity: document.getElementById('btnUiDensity'),
  themeSelect: document.getElementById('themeSelect'),
  languageSelect: document.getElementById('languageSelect'),
  loopRangeLabel: document.getElementById('loopRangeLabel'),
  cueStatusLabel: document.getElementById('cueStatusLabel'),
  seekBar: document.getElementById('seekBar'),
  timeLabel: document.getElementById('timeLabel'),
  trackList: document.getElementById('trackList'),
  trackCount: document.getElementById('trackCount'),
  clipLane: document.getElementById('clipLane'),
  waveContextMenu: document.getElementById('waveContextMenu'),
  panelContextMenu: document.getElementById('panelContextMenu'),
  panelContextPlayLabel: document.getElementById('panelContextPlayLabel'),
  automationCanvas: document.getElementById('automationCanvas'),
  automationTarget: document.getElementById('automationTarget'),
  btnAutomationReset: document.getElementById('btnAutomationReset'),
  dockMixer: document.getElementById('dockMixer'),
  dockMixerTracks: document.getElementById('dockMixerTracks'),
  selectedTrackLabel: document.getElementById('selectedTrackLabel'),
  waveCanvas: document.getElementById('waveCanvas'),
  statusText: document.getElementById('statusText'),
  masterVolume: document.getElementById('masterVolume'),
  masterVolumeValue: document.getElementById('masterVolumeValue'),
  meterL: document.getElementById('meterL'),
  meterR: document.getElementById('meterR'),
  meterHoldL: document.getElementById('meterHoldL'),
  meterHoldR: document.getElementById('meterHoldR'),
  peakDbL: document.getElementById('peakDbL'),
  peakDbR: document.getElementById('peakDbR'),
  projectFileInput: document.getElementById('projectFileInput')
};

function setStatus(text) {
  els.statusText.textContent = text;
}

function getThemeToken(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark';
}

function applyTheme(theme, showStatus = false) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  if (els.themeSelect) {
    els.themeSelect.value = nextTheme;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (err) {
    console.warn('Failed to persist theme', err);
  }

  if (showStatus) {
    const msg = nextTheme === 'light' ? '라이트 테마 적용' : '다크 테마 적용';
    setStatus(msg);
  }

  refreshSelectedTrackView();
  drawAutomationCurve();
}

function restoreTheme() {
  let saved = document.documentElement.dataset.theme || 'dark';
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY) || saved;
  } catch (err) {
    console.warn('Failed to restore theme', err);
  }
  applyTheme(saved, false);
}

function normalizeUiDensity(value) {
  return value === 'compact' ? 'compact' : 'studio';
}

function applyUiDensity(mode, showStatus = false) {
  const density = normalizeUiDensity(mode);
  state.uiDensity = density;
  document.body.dataset.uiDensity = density;

  if (els.btnUiDensity) {
    els.btnUiDensity.textContent = density === 'compact'
      ? I18n.t('densityCompactLabel', 'Density: Compact')
      : I18n.t('densityStudioLabel', 'Density: Studio');
    els.btnUiDensity.classList.toggle('active', density === 'compact');
  }

  try {
    localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
  } catch (err) {
    console.warn('Failed to persist ui density', err);
  }

  if (showStatus) {
    setStatus(density === 'compact' ? '컴팩트 UI 모드 적용' : '스튜디오 UI 모드 적용');
  }
}

function restoreUiDensity() {
  let saved = 'studio';
  try {
    saved = localStorage.getItem(UI_DENSITY_STORAGE_KEY) || 'studio';
  } catch (err) {
    console.warn('Failed to restore ui density', err);
  }
  applyUiDensity(saved, false);
}

function uid() {
  return `track_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  const sec = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatDb(linear) {
  if (!Number.isFinite(linear) || linear <= 0.00001) return '-inf dB';
  return `${(20 * Math.log10(linear)).toFixed(1)} dB`;
}

function setPlayButtonLabel(text) {
  const label = els.btnPlayPause?.querySelector('span:last-child');
  if (label) label.textContent = text;
}

function presetLabel(preset) {
  switch (preset) {
    case 'vocal':
      return I18n.t('presetVocal', 'Vocal');
    case 'drums':
      return I18n.t('presetDrums', 'Drums');
    case 'ambient':
      return I18n.t('presetAmbient', 'Ambient');
    case 'flat':
    default:
      return I18n.t('presetFlat', 'Flat');
  }
}

function trackFxLabel(key, value) {
  switch (key) {
    case 'lowEq':
      return `${I18n.t('trackLowEq', 'Low EQ')} (${value.toFixed(1)} dB)`;
    case 'midEq':
      return `${I18n.t('trackMidEq', 'Mid EQ')} (${value.toFixed(1)} dB)`;
    case 'highEq':
      return `${I18n.t('trackHighEq', 'High EQ')} (${value.toFixed(1)} dB)`;
    case 'compRatio':
      return `${I18n.t('trackCompRatio', 'Comp Ratio')} (${value.toFixed(1)}:1)`;
    case 'compThreshold':
      return `${I18n.t('trackCompThreshold', 'Comp Thresh')} (${value.toFixed(1)} dB)`;
    case 'reverbMix':
      return `${I18n.t('trackReverb', 'Reverb')} (${Math.round(value * 100)}%)`;
    case 'reverbDecay':
      return `${I18n.t('trackReverbDecay', 'Rev Decay')} (${value.toFixed(2)}s)`;
    case 'reverbPreDelay':
      return `${I18n.t('trackReverbPreDelay', 'Rev PreDelay')} (${(value * 1000).toFixed(0)}ms)`;
    default:
      return String(value);
  }
}

function refreshLocalizedPanels() {
  renderTrackList();
  refreshSelectedTrackView();
}

function applyLocalizedUi() {
  const playKey = state.isPlaying ? 'pause' : 'play';
  setPlayButtonLabel(I18n.t(playKey, state.isPlaying ? '일시정지' : '재생'));

  if (els.btnSnapGrid) {
    els.btnSnapGrid.textContent = state.clipSnapEnabled
      ? I18n.t('snapOn', 'Snap 1/32')
      : I18n.t('snapOff', 'Snap Off');
  }

  if (els.btnAutoCrossfade) {
    els.btnAutoCrossfade.textContent = state.autoCrossfadeEnabled
      ? I18n.t('xfadeOn', 'Auto XFade')
      : I18n.t('xfadeOff', 'XFade Off');
  }

  if (els.btnCurveMode) {
    els.btnCurveMode.textContent = state.automationCurveMode === 'smooth'
      ? I18n.t('curveSmooth', 'Curve: Smooth')
      : I18n.t('curveLinear', 'Curve: Linear');
  }

  if (els.btnUiDensity) {
    els.btnUiDensity.textContent = state.uiDensity === 'compact'
      ? I18n.t('densityCompactLabel', 'Density: Compact')
      : I18n.t('densityStudioLabel', 'Density: Studio');
  }

  const stopLabel = els.btnStop?.querySelector('span:last-child');
  if (stopLabel) stopLabel.textContent = I18n.t('stop', '정지');

  const exportLabel = els.btnExport?.querySelector('span:last-child');
  if (exportLabel) exportLabel.textContent = I18n.t('mixdownSave', '믹스 저장');

  if (els.panelContextPlayLabel) {
    els.panelContextPlayLabel.textContent = I18n.t(playKey, state.isPlaying ? '일시정지' : '재생');
  }
}

function timelineSpanSec() {
  return Math.max(state.duration || 0, 8);
}

function quantizeNormalized(value) {
  if (!state.clipSnapEnabled) return clamp(value, 0, 1);
  const div = Math.max(1, state.clipSnapDivisions);
  return clamp(Math.round(value * div) / div, 0, 1);
}

function quantizeSeconds(value, spanSec) {
  return quantizeNormalized(value / spanSec) * spanSec;
}

function getActiveAutomationPoints() {
  if (!state.automationCurves[state.automationTarget]) {
    state.automationCurves[state.automationTarget] = [
      { x: 0, y: 0.75 },
      { x: 1, y: 0.75 }
    ];
  }
  return state.automationCurves[state.automationTarget];
}

function sampleAutomation(points, x) {
  const nx = clamp(x, 0, 1);
  const pts = points.slice().sort((a, b) => a.x - b.x);
  if (!pts.length) return 0.5;
  if (nx <= pts[0].x) return pts[0].y;
  if (nx >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (nx <= b.x) {
      const t = (nx - a.x) / Math.max(0.0001, b.x - a.x);
      if (state.automationCurveMode === 'smooth') {
        const s = t * t * (3 - 2 * t);
        return a.y + (b.y - a.y) * s;
      }
      return a.y + (b.y - a.y) * t;
    }
  }
  return pts[pts.length - 1].y;
}

function getClipOverlapFade(trackId, clipStart, clipEnd) {
  if (!state.autoCrossfadeEnabled) {
    return { fadeIn: 0, fadeOut: 0 };
  }
  let fadeIn = 0;
  let fadeOut = 0;

  for (const c of state.clips) {
    if (c.trackId === trackId) continue;
    const otherStart = c.startSec;
    const otherEnd = c.startSec + c.durationSec;
    const overlapStart = Math.max(clipStart, otherStart);
    const overlapEnd = Math.min(clipEnd, otherEnd);
    const overlapDur = overlapEnd - overlapStart;
    if (overlapDur <= 0) continue;
    if (overlapStart <= clipStart + 0.0001) {
      fadeIn = Math.max(fadeIn, Math.min(state.autoCrossfadeSec, overlapDur));
    }
    if (overlapEnd >= clipEnd - 0.0001) {
      fadeOut = Math.max(fadeOut, Math.min(state.autoCrossfadeSec, overlapDur));
    }
  }

  return { fadeIn, fadeOut };
}

function defaultTrackFx() {
  return {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    compThreshold: -18,
    compRatio: 2,
    reverbMix: 0.08,
    reverbDecay: 1.8,
    reverbPreDelay: 0.02
  };
}

function sanitizeTrack(track) {
  return {
    ...track,
    cue: Boolean(track.cue),
    fxPreset: track.fxPreset || 'flat',
    fx: {
      ...defaultTrackFx(),
      ...(track.fx || {})
    }
  };
}

function addClipForTrack(track) {
  if (!track?.id || state.clips.some((c) => c.trackId === track.id)) return;
  state.clips.push({
    id: `clip_${track.id}`,
    trackId: track.id,
    name: track.name,
    startSec: 0,
    durationSec: Math.max(0.1, track.buffer?.duration || 1)
  });
}

function removeClipForTrack(trackId) {
  state.clips = state.clips.filter((c) => c.trackId !== trackId);
}

function getClipForTrack(trackId) {
  return state.clips.find((c) => c.trackId === trackId) || null;
}

function applyFxPreset(track, presetName) {
  const preset = FX_PRESETS[presetName];
  if (!preset) return;
  track.fx = { ...track.fx, ...preset };
  track.fxPreset = presetName;
}

function getSelectedTrack() {
  return state.tracks.find((t) => t.id === state.selectedTrackId) || null;
}

async function ensureAudioContext() {
  if (!engine.ctx) {
    engine.ctx = new (window.AudioContext || window.webkitAudioContext)();
    engine.masterGain = engine.ctx.createGain();
    engine.masterLimiter = engine.ctx.createDynamicsCompressor();
    engine.masterLimiter.threshold.value = -1.2;
    engine.masterLimiter.knee.value = 0;
    engine.masterLimiter.ratio.value = 20;
    engine.masterLimiter.attack.value = 0.003;
    engine.masterLimiter.release.value = 0.06;
    engine.cueGain = engine.ctx.createGain();
    engine.cueGain.gain.value = 0.9;
    engine.analyser = engine.ctx.createAnalyser();
    engine.analyser.fftSize = 2048;
    engine.analyser.smoothingTimeConstant = 0.8;
    engine.masterGain.connect(engine.masterLimiter);
    engine.masterLimiter.connect(engine.analyser);
    engine.cueGain.connect(engine.analyser);
    engine.analyser.connect(engine.ctx.destination);
  }
  if (engine.ctx.state === 'suspended') {
    await engine.ctx.resume();
  }
}

function createImpulseResponse(ctx, decay) {
  const fixedDecay = Math.min(6, Math.max(0.3, decay));
  const key = `${ctx.sampleRate}_${fixedDecay.toFixed(2)}`;
  if (impulseCache.has(key)) {
    return impulseCache.get(key);
  }

  const length = Math.floor(ctx.sampleRate * fixedDecay);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.4);
    }
  }
  impulseCache.set(key, impulse);
  return impulse;
}

function createTrackChain(ctx, track, destination) {
  const source = ctx.createBufferSource();
  source.buffer = track.buffer;

  const inputGain = ctx.createGain();
  const low = ctx.createBiquadFilter();
  const mid = ctx.createBiquadFilter();
  const high = ctx.createBiquadFilter();
  const comp = ctx.createDynamicsCompressor();
  const preDelay = ctx.createDelay(1.5);
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const convolver = ctx.createConvolver();
  const wetPost = ctx.createGain();
  const merge = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;

  low.type = 'lowshelf';
  low.frequency.value = 180;
  low.gain.value = track.fx.lowGain;

  mid.type = 'peaking';
  mid.frequency.value = 1100;
  mid.Q.value = 0.9;
  mid.gain.value = track.fx.midGain;

  high.type = 'highshelf';
  high.frequency.value = 4800;
  high.gain.value = track.fx.highGain;

  comp.threshold.value = track.fx.compThreshold;
  comp.ratio.value = track.fx.compRatio;
  comp.knee.value = 24;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;

  const reverbMix = Math.min(1, Math.max(0, track.fx.reverbMix));
  dry.gain.value = 1 - reverbMix;
  wet.gain.value = reverbMix;
  preDelay.delayTime.value = Math.min(1.5, Math.max(0, track.fx.reverbPreDelay));
  convolver.buffer = createImpulseResponse(ctx, track.fx.reverbDecay);

  inputGain.gain.value = dbToGain(track.gainDb);
  panner.pan.value = track.pan;

  source.connect(inputGain);
  inputGain.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(comp);

  comp.connect(dry);
  dry.connect(merge);

  comp.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wet);
  wet.connect(wetPost);
  wetPost.connect(merge);

  merge.connect(panner);
  panner.connect(analyser);
  analyser.connect(destination);

  return { source, analyser, inputGain, panner };
}

function recomputeDuration() {
  let max = 0;
  for (const track of state.tracks) {
    const clip = getClipForTrack(track.id);
    const start = clip?.startSec || 0;
    const dur = clip?.durationSec || track.buffer.duration;
    const end = start + dur;
    if (end > max) max = end;
  }
  state.duration = max;
}

function getCurrentTime() {
  if (!state.isPlaying || !engine.ctx) return state.playStartOffset;
  const delta = engine.ctx.currentTime - state.playStartContextTime;
  return Math.min(state.duration, state.playStartOffset + delta);
}

function stopAllSources() {
  for (const s of state.sourceNodes) {
    try {
      s.onended = null;
      s.stop();
      s.disconnect();
    } catch (_) {
      // ignore
    }
  }
  state.sourceNodes = [];
  state.trackMeterRuntime.clear();
}

function isTrackAudible(track) {
  const hasSolo = state.tracks.some((t) => t.solo);
  if (hasSolo) return track.solo;
  return !track.mute;
}

async function playMix() {
  if (!state.tracks.length) {
    setStatus('먼저 트랙을 추가하세요.');
    return;
  }
  await ensureAudioContext();
  stopAllSources();
  state.trackMeterRuntime.clear();

  const cueActive = state.cueMonitor && state.tracks.some((t) => t.cue);

  let startOffset = Math.max(0, Math.min(state.duration, state.playStartOffset));
  if (state.punchEnabled && state.loopIn !== null && state.loopOut !== null) {
    if (startOffset < state.loopIn || startOffset >= state.loopOut) {
      startOffset = state.loopIn;
    }
  }
  let liveNodes = 0;

  for (const track of state.tracks) {
    const clip = getClipForTrack(track.id);
    const clipStart = clip?.startSec || 0;
    const clipDuration = clip?.durationSec || track.buffer.duration;
    const clipEnd = clipStart + clipDuration;
    if (startOffset >= clipEnd) continue;

    const bufferOffset = Math.max(0, startOffset - clipStart);
    const when = Math.max(0, clipStart - startOffset);
    const availableInBuffer = Math.max(0, track.buffer.duration - bufferOffset);
    const availableInClip = Math.max(0, clipDuration - bufferOffset);
    const playDuration = Math.min(availableInBuffer, availableInClip);
    if (playDuration <= 0.001) continue;

    const sendToCue = cueActive && track.cue;
    const sendToMaster = !cueActive && isTrackAudible(track);
    if (!sendToCue && !sendToMaster) continue;

    const chain = createTrackChain(
      engine.ctx,
      track,
      sendToCue ? engine.cueGain : engine.masterGain
    );

    const { fadeIn, fadeOut } = getClipOverlapFade(track.id, clipStart, clipEnd);
    const baseGain = dbToGain(track.gainDb);
    const startTime = engine.ctx.currentTime + when;
    chain.inputGain.gain.cancelScheduledValues(startTime);
    chain.inputGain.gain.setValueAtTime(baseGain, startTime);
    if (fadeIn > 0) {
      chain.inputGain.gain.setValueAtTime(0.0001, startTime);
      chain.inputGain.gain.linearRampToValueAtTime(baseGain, startTime + fadeIn);
    }
    if (fadeOut > 0) {
      const fadeOutStart = Math.max(0, playDuration - fadeOut);
      chain.inputGain.gain.setValueAtTime(baseGain, startTime + fadeOutStart);
      chain.inputGain.gain.linearRampToValueAtTime(0.0001, startTime + playDuration);
    }

    chain.source.onended = () => {
      liveNodes -= 1;
      if (liveNodes <= 0 && state.isPlaying) {
        state.isPlaying = false;
        state.playStartOffset = 0;
        setPlayButtonLabel(I18n.t('play', '재생'));
        updateTimeAndSeek();
        setStatus('재생 완료');
      }
    };

    chain.source.start(when, bufferOffset, playDuration);
    state.sourceNodes.push(chain.source);
    state.trackMeterRuntime.set(track.id, {
      analyser: chain.analyser,
      hold: 0,
      peak: 0,
      inputGain: chain.inputGain,
      panner: chain.panner,
      baseGainDb: track.gainDb,
      basePan: track.pan
    });
    liveNodes += 1;
  }

  if (liveNodes === 0) {
    setStatus('재생 가능한 트랙이 없습니다. (뮤트/솔로 상태 확인)');
    return;
  }

  state.isPlaying = true;
  state.playStartContextTime = engine.ctx.currentTime;
  state.playStartOffset = startOffset;
  setPlayButtonLabel(I18n.t('pause', '일시정지'));
  setStatus('믹스 재생 중');
}

function pauseMix() {
  if (!state.isPlaying) return;
  state.playStartOffset = getCurrentTime();
  state.isPlaying = false;
  stopAllSources();
  setPlayButtonLabel(I18n.t('play', '재생'));
  setStatus('일시정지');
}

function stopMix() {
  state.isPlaying = false;
  state.playStartOffset = 0;
  stopAllSources();
  setPlayButtonLabel(I18n.t('play', '재생'));
  updateTimeAndSeek();
  setStatus('정지');
}

function updateTimeAndSeek() {
  const current = getCurrentTime();
  els.seekBar.value = state.duration > 0 ? String(current / state.duration) : '0';
  els.timeLabel.textContent = `${formatTime(current)} / ${formatTime(state.duration)}`;
}

function updateLoopUi() {
  const hasLoop = state.loopIn !== null && state.loopOut !== null;
  if (!hasLoop) {
    els.loopRangeLabel.textContent = 'Loop: Off';
  } else {
    els.loopRangeLabel.textContent = `Loop: ${formatTime(state.loopIn)} - ${formatTime(state.loopOut)}`;
  }
  els.btnRecArm.classList.toggle('active', state.recArmed);
  els.btnPunch.classList.toggle('active', state.punchEnabled);
  if (els.btnCueMonitor) els.btnCueMonitor.classList.toggle('active', state.cueMonitor);
  if (els.cueStatusLabel) {
    const cueTracks = state.tracks.filter((t) => t.cue).length;
    els.cueStatusLabel.textContent = state.cueMonitor
      ? `CUE: On (${cueTracks})`
      : 'CUE: Off';
  }
}

function setLoopIn() {
  state.loopIn = getCurrentTime();
  if (state.loopOut !== null && state.loopOut <= state.loopIn) {
    state.loopOut = null;
  }
  updateLoopUi();
  setStatus('Loop In 설정');
}

function setLoopOut() {
  const t = getCurrentTime();
  if (state.loopIn === null) {
    state.loopIn = 0;
  }
  if (t <= state.loopIn) {
    state.loopOut = Math.min(state.duration || state.loopIn + 0.1, state.loopIn + 0.1);
  } else {
    state.loopOut = t;
  }
  updateLoopUi();
  setStatus('Loop Out 설정');
}

function drawWaveform(buffer) {
  const canvas = els.waveCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const waveBg = getThemeToken('--wave-bg', '#080b10');
  const waveText = getThemeToken('--text-muted', '#8891bc');
  const waveColor = getThemeToken('--wave-color', '#4da3ff');

  canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = waveBg;
  ctx.fillRect(0, 0, width, height);

  if (!buffer) {
    ctx.fillStyle = waveText;
    ctx.font = '14px Space Grotesk';
    ctx.fillText(I18n.t('selectedTrackNone', '선택된 트랙 없음'), 16, 28);
    return;
  }

  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / Math.max(1, width));
  const mid = height / 2;

  ctx.strokeStyle = waveColor;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    let min = 1;
    let max = -1;
    const start = x * step;
    const end = Math.min(start + step, data.length);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, mid + min * mid * 0.85);
    ctx.lineTo(x, mid + max * mid * 0.85);
  }

  ctx.stroke();
}

function renderClipLane() {
  if (!els.clipLane) return;
  const lane = els.clipLane;
  lane.innerHTML = '';
  const spanSec = timelineSpanSec();

  state.clips.forEach((clip, index) => {
    const track = state.tracks.find((t) => t.id === clip.trackId);
    const block = document.createElement('div');
    block.className = `clip-block${track?.id === state.selectedTrackId ? ' selected' : ''}`;
    block.dataset.clipId = clip.id;
    block.style.left = `${(clip.startSec / spanSec) * 100}%`;
    block.style.width = `${Math.max(1, (clip.durationSec / spanSec) * 100)}%`;
    block.style.top = `${6 + index * 28}px`;
    block.innerHTML = `<span>${escapeHtml(track?.name || clip.name)}</span><i class="clip-resize"></i>`;

    block.addEventListener('pointerdown', (ev) => {
      if (track?.id) {
        state.selectedTrackId = track.id;
        refreshSelectedTrackView();
      }
      const rect = lane.getBoundingClientRect();
      const pxPerSec = rect.width / spanSec;
      const startX = ev.clientX;
      const initialStart = clip.startSec;
      const initialDur = clip.durationSec;
      const resizing = ev.target.classList.contains('clip-resize');

      const onMove = (moveEv) => {
        const dxSec = (moveEv.clientX - startX) / pxPerSec;
        if (resizing) {
          const raw = clamp(initialDur + dxSec, 0.1, spanSec);
          clip.durationSec = clamp(
            quantizeSeconds(raw, spanSec),
            0.1,
            Math.max(0.1, spanSec - clip.startSec)
          );
        } else {
          const raw = clamp(initialStart + dxSec, 0, Math.max(0, spanSec - clip.durationSec));
          clip.startSec = clamp(quantizeSeconds(raw, spanSec), 0, Math.max(0, spanSec - clip.durationSec));
        }
        recomputeDuration();
        updateTimeAndSeek();
        renderClipLane();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    lane.appendChild(block);
  });
}

function drawAutomationCurve() {
  const canvas = els.automationCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const waveBg = getThemeToken('--wave-bg', '#080b10');
  const waveGrid = getThemeToken('--wave-grid', '#243044');
  const waveColor = getThemeToken('--wave-color', '#4da3ff');
  const wavePoint = getThemeToken('--text-inverse', '#d8f8ff');
  canvas.width = Math.max(1, Math.floor(width * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(height * devicePixelRatio));
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = waveBg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = waveGrid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const pts = getActiveAutomationPoints().slice().sort((a, b) => a.x - b.x);
  ctx.strokeStyle = waveColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = p.x * width;
    const y = (1 - p.y) * height;
    if (i === 0) {
      ctx.moveTo(x, y);
      return;
    }
    if (state.automationCurveMode === 'smooth') {
      const prev = pts[i - 1];
      const prevX = prev.x * width;
      const prevY = (1 - prev.y) * height;
      const midX = (prevX + x) * 0.5;
      ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) * 0.5);
      ctx.quadraticCurveTo(x, y, x, y);
      return;
    }
    ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = wavePoint;
  pts.forEach((p) => {
    const x = p.x * width;
    const y = (1 - p.y) * height;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function bindAutomationUi() {
  const canvas = els.automationCanvas;
  if (!canvas) return;

  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const nx = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    const ny = clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1);
    const points = getActiveAutomationPoints();
    let nearest = -1;
    let nearestDist = 0.04;

    points.forEach((p, i) => {
      const d = Math.hypot(p.x - nx, p.y - ny);
      if (d < nearestDist) {
        nearest = i;
        nearestDist = d;
      }
    });

    if (nearest > 0 && nearest < points.length - 1 && points.length > 2) {
      points.splice(nearest, 1);
      drawAutomationCurve();
    }
  });

  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const nx = quantizeNormalized((ev.clientX - rect.left) / rect.width);
    const ny = clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1);
    const points = getActiveAutomationPoints();
    let nearest = -1;
    let nearestDist = 0.03;

    points.forEach((p, i) => {
      const d = Math.hypot(p.x - nx, p.y - ny);
      if (d < nearestDist) {
        nearest = i;
        nearestDist = d;
      }
    });

    if (nearest === -1) {
      points.push({ x: nx, y: ny });
      nearest = points.length - 1;
    }

    state.automationDragIndex = nearest;
    drawAutomationCurve();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (state.automationDragIndex < 0) return;
    const rect = canvas.getBoundingClientRect();
    const nx = quantizeNormalized((ev.clientX - rect.left) / rect.width);
    const ny = clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1);
    const points = getActiveAutomationPoints();
    const p = points[state.automationDragIndex];
    if (!p) return;
    p.x = nx;
    p.y = ny;
    drawAutomationCurve();
  });

  const finish = () => {
    state.automationDragIndex = -1;
    const points = getActiveAutomationPoints();
    points.sort((a, b) => a.x - b.x);
    if (points.length) {
      points[0].x = 0;
      points[points.length - 1].x = 1;
    }
    drawAutomationCurve();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointerleave', finish);
}

function renderDockMixer() {
  if (!els.dockMixerTracks) return;
  els.dockMixerTracks.innerHTML = '';

  for (const track of state.tracks) {
    const strip = document.createElement('div');
    strip.className = 'dock-strip';
    strip.dataset.trackId = track.id;
    strip.innerHTML = `
      <div class="dock-strip-head" data-dock-drag-handle="true">
        <div class="dock-name">${escapeHtml(track.name)}</div>
        <div class="dock-mini-meter" aria-hidden="true">
          <div class="dock-mini-fill" data-role="dockMiniFill"></div>
          <div class="dock-mini-hold" data-role="dockMiniHold"></div>
        </div>
      </div>
      <input data-role="dockVol" class="dock-fader" type="range" min="-24" max="6" step="0.1" value="${track.gainDb}" />
      <div class="dock-val">${track.gainDb.toFixed(1)} dB</div>
      <input data-role="dockPan" type="range" min="-1" max="1" step="0.01" value="${track.pan}" />
      <div class="dock-actions">
        <button data-role="dockMute" class="mini-btn${track.mute ? ' active' : ''}" type="button">M</button>
        <button data-role="dockSolo" class="mini-btn${track.solo ? ' active' : ''}" type="button">S</button>
      </div>
    `;

    const vol = strip.querySelector('[data-role="dockVol"]');
    const val = strip.querySelector('.dock-val');
    const pan = strip.querySelector('[data-role="dockPan"]');

    vol.addEventListener('input', () => {
      track.gainDb = Number(vol.value);
      val.textContent = `${track.gainDb.toFixed(1)} dB`;
      syncTrackCardControls(track);
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    pan.addEventListener('input', () => {
      track.pan = Number(pan.value);
      syncTrackCardControls(track);
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    strip.querySelector('[data-role="dockMute"]').addEventListener('click', () => {
      track.mute = !track.mute;
      renderTrackList();
      updateLoopUi();
    });
    strip.querySelector('[data-role="dockSolo"]').addEventListener('click', () => {
      track.solo = !track.solo;
      renderTrackList();
      updateLoopUi();
    });

    els.dockMixerTracks.appendChild(strip);
  }
}

function syncTrackCardControls(track) {
  const card = els.trackList?.querySelector(`[data-track-id="${track.id}"]`);
  if (!card) return;

  const vol = card.querySelector('[data-role="vol"]');
  const volFader = card.querySelector('[data-role="volFader"]');
  const volValue = card.querySelector('[data-role="volv"]');
  const pan = card.querySelector('[data-role="pan"]');
  const panValue = card.querySelector('[data-role="panv"]');
  const faderLabel = card.querySelector('.v-fader-label');

  if (vol) vol.value = String(track.gainDb);
  if (volFader) volFader.value = String(track.gainDb);
  if (volValue) volValue.textContent = `${track.gainDb.toFixed(1)} dB`;
  if (faderLabel) faderLabel.textContent = `${track.gainDb.toFixed(1)} dB`;
  if (pan) pan.value = String(track.pan);
  if (panValue) panValue.textContent = track.pan.toFixed(2);
}

function bindDockMixerScroll() {
  const dock = els.dockMixerTracks;
  if (!dock || dock.dataset.scrollBound === 'true') return;
  dock.dataset.scrollBound = 'true';

  let dragState = null;

  dock.addEventListener('wheel', (ev) => {
    const canScroll = dock.scrollWidth > dock.clientWidth;
    if (!canScroll) return;

    const dominantDelta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if (dominantDelta === 0) return;

    dock.scrollLeft += dominantDelta;
    ev.preventDefault();
  }, { passive: false });

  dock.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const dragHandle = ev.target.closest('[data-dock-drag-handle]');
    if (!dragHandle && ev.target !== dock) return;
    if (dock.scrollWidth <= dock.clientWidth) return;

    ev.preventDefault();

    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startScrollLeft: dock.scrollLeft
    };

    dock.classList.add('dragging');
    dock.setPointerCapture(ev.pointerId);
  });

  dock.addEventListener('pointermove', (ev) => {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    ev.preventDefault();
    const dx = ev.clientX - dragState.startX;
    dock.scrollLeft = dragState.startScrollLeft - dx;
  });

  const finishDrag = (ev) => {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    dock.classList.remove('dragging');
    if (dock.hasPointerCapture(ev.pointerId)) {
      dock.releasePointerCapture(ev.pointerId);
    }
    dragState = null;
  };

  dock.addEventListener('pointerup', finishDrag);
  dock.addEventListener('pointercancel', finishDrag);
}

function applyAutomationRuntime() {
  if (!state.isPlaying) return;
  const points = getActiveAutomationPoints();
  if (!points.length) return;
  const span = timelineSpanSec();
  const nx = clamp(getCurrentTime() / span, 0, 1);
  const value = sampleAutomation(points, nx);

  if (state.automationTarget === 'master') {
    const db = -24 + value * 30;
    if (engine.masterGain && engine.ctx) {
      engine.masterGain.gain.setTargetAtTime(dbToGain(db), engine.ctx.currentTime, 0.01);
    }
    return;
  }

  const selected = getSelectedTrack();
  if (!selected) return;
  const runtime = state.trackMeterRuntime.get(selected.id);
  if (!runtime || !engine.ctx) return;

  if (state.automationTarget === 'trackVolume' && runtime.inputGain) {
    const db = -24 + value * 30;
    runtime.inputGain.gain.setTargetAtTime(dbToGain(db), engine.ctx.currentTime, 0.01);
  }

  if (state.automationTarget === 'trackPan' && runtime.panner) {
    const pan = -1 + value * 2;
    runtime.panner.pan.setTargetAtTime(pan, engine.ctx.currentTime, 0.01);
  }
}

function clearDropMarks() {
  for (const card of els.trackList.querySelectorAll('.track-card')) {
    card.classList.remove('drop-before', 'drop-after', 'drag-over');
  }
}

function moveTrackRelative(draggedId, targetId, before = true) {
  if (!draggedId || !targetId || draggedId === targetId) return;
  const from = state.tracks.findIndex((t) => t.id === draggedId);
  if (from < 0) return;

  const [item] = state.tracks.splice(from, 1);
  const targetIndex = state.tracks.findIndex((t) => t.id === targetId);
  if (targetIndex < 0) {
    state.tracks.push(item);
  } else {
    const insertIndex = before ? targetIndex : targetIndex + 1;
    state.tracks.splice(insertIndex, 0, item);
  }

  renderTrackList();
  if (state.isPlaying) {
    pauseMix();
    playMix();
  }
}

function renderTrackList() {
  els.trackList.innerHTML = '';
  els.trackCount.textContent = String(state.tracks.length);

  for (const track of state.tracks) {
    const item = document.createElement('article');
    item.className = `track-card${track.id === state.selectedTrackId ? ' active' : ''}`;
    item.draggable = true;
    item.dataset.trackId = track.id;

    const ext = (track.format || getExtension(track.name) || 'audio').toUpperCase();
    item.innerHTML = `
      <div class="track-head">
        <div>
          <div class="track-name">${escapeHtml(track.name)}</div>
          <div class="track-meta">${ext} · ${formatTime(track.buffer.duration)}</div>
        </div>
        <div class="head-right">
          <div class="track-mini-meter" aria-hidden="true">
            <div class="track-mini-fill" data-role="miniFill"></div>
            <div class="track-mini-hold" data-role="miniHold"></div>
          </div>
          <div class="drag-handle">::</div>
        </div>
      </div>

      <div class="preset-row">
        <button data-role="preset" data-preset="flat" class="mini-btn${track.fxPreset === 'flat' ? ' active' : ''}" type="button">${escapeHtml(presetLabel('flat'))}</button>
        <button data-role="preset" data-preset="vocal" class="mini-btn${track.fxPreset === 'vocal' ? ' active' : ''}" type="button">${escapeHtml(presetLabel('vocal'))}</button>
        <button data-role="preset" data-preset="drums" class="mini-btn${track.fxPreset === 'drums' ? ' active' : ''}" type="button">${escapeHtml(presetLabel('drums'))}</button>
        <button data-role="preset" data-preset="ambient" class="mini-btn${track.fxPreset === 'ambient' ? ' active' : ''}" type="button">${escapeHtml(presetLabel('ambient'))}</button>
      </div>

      <div class="channel-strip">
      <div class="fader-row">
        <div class="v-fader-wrap">
          <input data-role="volFader" class="v-fader" type="range" min="-24" max="6" step="0.1" value="${track.gainDb}" />
          <span class="v-fader-label">${track.gainDb.toFixed(1)} dB</span>
        </div>
        <div class="strip-inline-controls">
          <div class="track-controls">
            <span>${escapeHtml(I18n.t('trackVolumeShort', 'Vol'))}</span>
            <input data-role="vol" type="range" min="-24" max="6" step="0.1" value="${track.gainDb}" />
            <span data-role="volv">${track.gainDb.toFixed(1)} dB</span>
          </div>

          <div class="track-controls">
            <span>${escapeHtml(I18n.t('trackPanShort', 'Pan'))}</span>
            <input data-role="pan" type="range" min="-1" max="1" step="0.01" value="${track.pan}" />
            <span data-role="panv">${track.pan.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="track-fx-grid">
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('lowEq', track.fx.lowGain))}</label>
          <input data-role="fxLow" type="range" min="-12" max="12" step="0.1" value="${track.fx.lowGain}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('midEq', track.fx.midGain))}</label>
          <input data-role="fxMid" type="range" min="-12" max="12" step="0.1" value="${track.fx.midGain}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('highEq', track.fx.highGain))}</label>
          <input data-role="fxHigh" type="range" min="-12" max="12" step="0.1" value="${track.fx.highGain}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('compRatio', track.fx.compRatio))}</label>
          <input data-role="fxCompRatio" type="range" min="1" max="12" step="0.1" value="${track.fx.compRatio}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('compThreshold', track.fx.compThreshold))}</label>
          <input data-role="fxCompThreshold" type="range" min="-60" max="0" step="0.5" value="${track.fx.compThreshold}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('reverbMix', track.fx.reverbMix))}</label>
          <input data-role="fxReverbMix" type="range" min="0" max="1" step="0.01" value="${track.fx.reverbMix}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('reverbDecay', track.fx.reverbDecay))}</label>
          <input data-role="fxReverbDecay" type="range" min="0.3" max="6" step="0.05" value="${track.fx.reverbDecay}" />
        </div>
        <div class="track-fx">
          <label>${escapeHtml(trackFxLabel('reverbPreDelay', track.fx.reverbPreDelay))}</label>
          <input data-role="fxReverbPreDelay" type="range" min="0" max="0.3" step="0.005" value="${track.fx.reverbPreDelay}" />
        </div>
      </div>
      </div>

      <div class="track-actions">
        <button data-role="cue" class="mini-btn${track.cue ? ' active' : ''}" type="button">C</button>
        <button data-role="mute" class="mini-btn${track.mute ? ' active' : ''}" type="button">M</button>
        <button data-role="solo" class="mini-btn${track.solo ? ' active' : ''}" type="button">S</button>
        <button data-role="select" class="mini-btn" type="button">${escapeHtml(I18n.t('selectTrack', 'Select'))}</button>
        <button data-role="remove" class="mini-btn danger" type="button">${escapeHtml(I18n.t('deleteTrack', 'Delete'))}</button>
      </div>
    `;

    item.addEventListener('dragstart', (e) => {
      state.draggedTrackId = track.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', track.id);
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      clearDropMarks();
      const rect = item.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      item.classList.add(before ? 'drop-before' : 'drop-after');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drop-before', 'drop-after', 'drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const rect = item.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const dragged = e.dataTransfer.getData('text/plain') || state.draggedTrackId;
      clearDropMarks();
      moveTrackRelative(dragged, track.id, before);
    });

    item.addEventListener('dragend', () => {
      clearDropMarks();
      state.draggedTrackId = null;
    });

    const vol = item.querySelector('[data-role="vol"]');
    const volFader = item.querySelector('[data-role="volFader"]');
        item.querySelectorAll('[data-role="preset"]').forEach((button) => {
          button.addEventListener('click', () => {
            const preset = button.dataset.preset;
            applyFxPreset(track, preset);
            renderTrackList();
            if (state.isPlaying) {
              pauseMix();
              playMix();
            }
          });
        });

    const pan = item.querySelector('[data-role="pan"]');
    const volV = item.querySelector('[data-role="volv"]');
    const panV = item.querySelector('[data-role="panv"]');

    vol.addEventListener('input', () => {
      track.gainDb = Number(vol.value);
      volFader.value = vol.value;
      volV.textContent = `${track.gainDb.toFixed(1)} dB`;
      const faderLabel = item.querySelector('.v-fader-label');
      if (faderLabel) faderLabel.textContent = `${track.gainDb.toFixed(1)} dB`;
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    volFader.addEventListener('input', () => {
      track.gainDb = Number(volFader.value);
      vol.value = volFader.value;
      volV.textContent = `${track.gainDb.toFixed(1)} dB`;
      const faderLabel = item.querySelector('.v-fader-label');
      if (faderLabel) faderLabel.textContent = `${track.gainDb.toFixed(1)} dB`;
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    pan.addEventListener('input', () => {
      track.pan = Number(pan.value);
      panV.textContent = track.pan.toFixed(2);
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    for (const [role, key] of [
      ['fxLow', 'lowGain'],
      ['fxMid', 'midGain'],
      ['fxHigh', 'highGain'],
      ['fxCompThreshold', 'compThreshold'],
      ['fxCompRatio', 'compRatio'],
      ['fxReverbMix', 'reverbMix'],
      ['fxReverbDecay', 'reverbDecay'],
      ['fxReverbPreDelay', 'reverbPreDelay']
    ]) {
      const input = item.querySelector(`[data-role="${role}"]`);
      input.addEventListener('input', () => {
        track.fx[key] = Number(input.value);
        renderTrackList();
        if (state.isPlaying) {
          pauseMix();
          playMix();
        }
      });
    }

    item.querySelector('[data-role="mute"]').addEventListener('click', () => {
      track.mute = !track.mute;
      renderTrackList();
      updateLoopUi();
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    item.querySelector('[data-role="cue"]').addEventListener('click', () => {
      track.cue = !track.cue;
      renderTrackList();
      updateLoopUi();
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    item.querySelector('[data-role="solo"]').addEventListener('click', () => {
      track.solo = !track.solo;
      renderTrackList();
      updateLoopUi();
      if (state.isPlaying) {
        pauseMix();
        playMix();
      }
    });

    item.querySelector('[data-role="select"]').addEventListener('click', () => {
      state.selectedTrackId = track.id;
      renderTrackList();
      refreshSelectedTrackView();
    });

    item.querySelector('[data-role="remove"]').addEventListener('click', () => {
      const idx = state.tracks.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        removeClipForTrack(track.id);
        state.tracks.splice(idx, 1);
      }
      if (state.selectedTrackId === track.id) {
        state.selectedTrackId = state.tracks[0]?.id || null;
      }
      recomputeDuration();
      renderTrackList();
      refreshSelectedTrackView();
      updateTimeAndSeek();
      setStatus('트랙 삭제 완료');
    });

    els.trackList.appendChild(item);
  }

  renderClipLane();
  renderDockMixer();
}

function refreshSelectedTrackView() {
  const selected = getSelectedTrack();
  els.selectedTrackLabel.textContent = selected
    ? `${selected.name} · ${selected.buffer.numberOfChannels}ch · ${selected.buffer.sampleRate}Hz`
    : '선택된 트랙 없음';
  drawWaveform(selected?.buffer || null);
}

async function decodeEntry(entry) {
  await ensureAudioContext();
  const source = entry.buffer instanceof ArrayBuffer ? entry.buffer : null;
  if (!source || source.byteLength === 0) throw new Error('invalid audio');
  return engine.ctx.decodeAudioData(source.slice(0));
}

async function addAudioEntries(entries) {
  if (!entries?.length) return;
  setStatus('파일 디코딩 중...');

  let imported = 0;
  for (const entry of entries) {
    if (!isSupportedAudioFile(entry.name || '', entry.mime || '')) continue;
    try {
      const buffer = await decodeEntry(entry);
      state.tracks.push(sanitizeTrack({
        id: uid(),
        name: entry.name || 'untitled',
        format: getExtension(entry.name || ''),
        sourceMime: entry.mime || '',
        sourceBytes: entry.buffer instanceof ArrayBuffer ? entry.buffer.slice(0) : null,
        buffer,
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false
      }));
      addClipForTrack(state.tracks[state.tracks.length - 1]);
      imported += 1;
    } catch (err) {
      console.error(err);
    }
  }

  if (imported > 0) {
    if (!state.selectedTrackId) state.selectedTrackId = state.tracks[0].id;
    recomputeDuration();
    renderTrackList();
    refreshSelectedTrackView();
    updateTimeAndSeek();
    setStatus(`${imported}개 트랙 추가됨`);
  } else {
    setStatus('추가 가능한 오디오 파일이 없습니다.');
  }
}

async function importAudio() {
  try {
    let entries = [];
    if (window.electronAPI?.isElectron) {
      entries = await window.electronAPI.openAudioFiles();
    } else {
      entries = await openAudioFilesWeb();
    }
    await addAudioEntries(entries);
  } catch (err) {
    console.error(err);
    setStatus('파일 불러오기 실패');
  }
}

async function addTestTone() {
  try {
    await ensureAudioContext();
    const seconds = 2;
    const freq = 440;
    const sampleRate = engine.ctx.sampleRate;
    const frames = Math.floor(sampleRate * seconds);
    const buffer = engine.ctx.createBuffer(1, frames, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frames; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, i / (sampleRate * 0.02)) * Math.min(1, (frames - i) / (sampleRate * 0.08));
      data[i] = Math.sin(2 * Math.PI * freq * t) * 0.35 * env;
    }

    state.tracks.push(sanitizeTrack({
      id: uid(),
      name: `Tone_${freq}Hz_${seconds}s.wav`,
      format: 'wav',
      sourceMime: 'audio/wav',
      sourceBytes: audioBufferToWav(buffer),
      buffer,
      gainDb: 0,
      pan: 0,
      mute: false,
      solo: false
    }));
    addClipForTrack(state.tracks[state.tracks.length - 1]);

    if (!state.selectedTrackId) state.selectedTrackId = state.tracks[0].id;
    recomputeDuration();
    renderTrackList();
    refreshSelectedTrackView();
    updateTimeAndSeek();
    setStatus('테스트 톤 트랙 추가됨');
  } catch (err) {
    console.error(err);
    setStatus('테스트 톤 생성 실패');
  }
}

async function exportMix() {
  if (!state.tracks.length) {
    setStatus('내보낼 트랙이 없습니다.');
    return;
  }

  setStatus('오프라인 믹스 렌더링 중...');

  const sampleRate = Math.max(...state.tracks.map((t) => t.buffer.sampleRate));
  const length = Math.ceil(state.duration * sampleRate);
  const offline = new OfflineAudioContext(2, Math.max(1, length), sampleRate);
  const master = offline.createGain();
  master.gain.value = dbToGain(Number(els.masterVolume.value));
  master.connect(offline.destination);

  for (const track of state.tracks) {
    if (!isTrackAudible(track)) continue;
    const chain = createTrackChain(offline, track, master);
    chain.source.start(0);
  }

  try {
    const rendered = await offline.startRendering();
    const wav = audioBufferToWav(rendered);
    const result = await saveWav(wav, 'mixdown.wav');
    setStatus(result?.ok ? '믹스 저장 완료' : '믹스 저장 취소/실패');
  } catch (err) {
    console.error(err);
    setStatus('믹스 저장 실패');
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function saveProject() {
  if (!state.tracks.length) {
    setStatus('저장할 프로젝트가 없습니다.');
    return;
  }

  setStatus('프로젝트 패키징 중...');

  const tracks = [];
  for (const track of state.tracks) {
    const hasSource = track.sourceBytes instanceof ArrayBuffer && track.sourceBytes.byteLength > 0;
    const audioEncoding = hasSource ? 'source' : 'wav';
    const audioPayload = hasSource ? track.sourceBytes : audioBufferToWav(track.buffer);
    tracks.push({
      id: track.id,
      name: track.name,
      format: track.format,
      gainDb: track.gainDb,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
      fx: track.fx,
      fxPreset: track.fxPreset || 'flat',
      cue: Boolean(track.cue),
      sourceMime: track.sourceMime || '',
      audioEncoding,
      audioBase64: arrayBufferToBase64(audioPayload)
    });
  }

  const project = {
    version: 1,
    createdAt: new Date().toISOString(),
    masterDb: Number(els.masterVolume.value),
    recArmed: state.recArmed,
    punchEnabled: state.punchEnabled,
    cueMonitor: state.cueMonitor,
    loopIn: state.loopIn,
    loopOut: state.loopOut,
    selectedTrackId: state.selectedTrackId,
    clips: state.clips,
    automationCurves: state.automationCurves,
    automationTarget: state.automationTarget,
    automationCurveMode: state.automationCurveMode,
    clipSnapEnabled: state.clipSnapEnabled,
    clipSnapDivisions: state.clipSnapDivisions,
    autoCrossfadeEnabled: state.autoCrossfadeEnabled,
    autoCrossfadeSec: state.autoCrossfadeSec,
    tracks
  };

  const json = JSON.stringify(project);
  let blob = new Blob([json], { type: 'application/json' });
  let fileName = `mixer_project_${Date.now()}.json`;
  let arrayBuffer = await blob.arrayBuffer();

  if ('CompressionStream' in window) {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer();
    blob = new Blob([compressed], { type: 'application/gzip' });
    fileName = `mixer_project_${Date.now()}.smixz`;
    arrayBuffer = compressed;
  }

  if (window.electronAPI?.isElectron && window.electronAPI.saveProjectFile) {
    const result = await window.electronAPI.saveProjectFile({
      defaultName: fileName,
      data: arrayBuffer
    });
    setStatus(result?.ok ? '프로젝트 저장 완료' : '프로젝트 저장 취소/실패');
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('프로젝트 저장 파일 생성 완료');
}

async function loadProjectFromFile(file) {
  if (!file) return;

  setStatus('프로젝트 불러오는 중...');

  try {
    const isCompressed = file.name.toLowerCase().endsWith('.smixz');
    let text = '';
    if (isCompressed && 'DecompressionStream' in window) {
      const arrayBuffer = await file.arrayBuffer();
      const decompressed = await new Response(
        new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer();
      text = new TextDecoder().decode(decompressed);
    } else if (isCompressed) {
      throw new Error('Compressed project is not supported in this runtime');
    } else {
      text = await file.text();
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.tracks)) {
      throw new Error('invalid project');
    }

    await ensureAudioContext();

    const loaded = [];
    for (const t of parsed.tracks) {
      if (!t.audioBase64) continue;
      const arr = base64ToArrayBuffer(t.audioBase64);
      const buffer = await engine.ctx.decodeAudioData(arr.slice(0));
      loaded.push(sanitizeTrack({
        id: t.id || uid(),
        name: t.name || 'untitled',
        format: t.format || 'wav',
        sourceMime: t.sourceMime || '',
        sourceBytes: arr,
        buffer,
        gainDb: Number.isFinite(t.gainDb) ? t.gainDb : 0,
        pan: Number.isFinite(t.pan) ? t.pan : 0,
        mute: Boolean(t.mute),
        solo: Boolean(t.solo),
        cue: Boolean(t.cue),
        fx: t.fx || defaultTrackFx()
        ,
        fxPreset: t.fxPreset || 'flat'
      }));
    }

    state.tracks = loaded;
    const defaultClips = loaded.map((t) => ({
      id: `clip_${t.id}`,
      trackId: t.id,
      name: t.name,
      startSec: 0,
      durationSec: Math.max(0.1, t.buffer.duration)
    }));
    const loadedClips = Array.isArray(parsed.clips)
      ? parsed.clips
          .filter((c) => loaded.some((t) => t.id === c.trackId))
          .map((c) => ({
            id: c.id || `clip_${c.trackId}`,
            trackId: c.trackId,
            name: c.name || loaded.find((t) => t.id === c.trackId)?.name || 'clip',
            startSec: Number.isFinite(c.startSec) ? c.startSec : 0,
            durationSec: Number.isFinite(c.durationSec) ? Math.max(0.1, c.durationSec) : 1
          }))
      : [];
    state.clips = loadedClips.length ? loadedClips : defaultClips;
    state.automationCurves = {
      trackVolume: Array.isArray(parsed.automationCurves?.trackVolume)
        ? parsed.automationCurves.trackVolume
        : [{ x: 0, y: 0.75 }, { x: 1, y: 0.75 }],
      trackPan: Array.isArray(parsed.automationCurves?.trackPan)
        ? parsed.automationCurves.trackPan
        : [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
      master: Array.isArray(parsed.automationCurves?.master)
        ? parsed.automationCurves.master
        : [{ x: 0, y: 0.75 }, { x: 1, y: 0.75 }]
    };
    state.automationTarget = ['trackVolume', 'trackPan', 'master'].includes(parsed.automationTarget)
      ? parsed.automationTarget
      : 'trackVolume';
    state.automationCurveMode = parsed.automationCurveMode === 'smooth' ? 'smooth' : 'linear';
    state.clipSnapEnabled = parsed.clipSnapEnabled !== false;
    state.clipSnapDivisions = Number.isFinite(parsed.clipSnapDivisions)
      ? Math.max(1, Math.floor(parsed.clipSnapDivisions))
      : 32;
    state.autoCrossfadeEnabled = parsed.autoCrossfadeEnabled !== false;
    state.autoCrossfadeSec = Number.isFinite(parsed.autoCrossfadeSec)
      ? clamp(parsed.autoCrossfadeSec, 0.02, 0.8)
      : 0.16;
    state.recArmed = Boolean(parsed.recArmed);
    state.punchEnabled = Boolean(parsed.punchEnabled);
    state.cueMonitor = Boolean(parsed.cueMonitor);
    state.loopIn = Number.isFinite(parsed.loopIn) ? parsed.loopIn : null;
    state.loopOut = Number.isFinite(parsed.loopOut) ? parsed.loopOut : null;
    state.selectedTrackId = loaded.some((t) => t.id === parsed.selectedTrackId)
      ? parsed.selectedTrackId
      : loaded[0]?.id || null;

    els.masterVolume.value = String(Number.isFinite(parsed.masterDb) ? parsed.masterDb : 0);
    updateMaster();

    stopMix();
    recomputeDuration();
    renderTrackList();
    refreshSelectedTrackView();
    updateTimeAndSeek();
    updateLoopUi();
    if (els.automationTarget) els.automationTarget.value = state.automationTarget;
    if (els.btnSnapGrid) {
      els.btnSnapGrid.classList.toggle('active', state.clipSnapEnabled);
    }
    if (els.btnAutoCrossfade) {
      els.btnAutoCrossfade.classList.toggle('active', state.autoCrossfadeEnabled);
    }
    if (els.btnCurveMode) {
      els.btnCurveMode.classList.toggle('active', state.automationCurveMode === 'smooth');
    }
    applyLocalizedUi();
    drawAutomationCurve();

    setStatus(`프로젝트 로드 완료 (${loaded.length} tracks)`);
  } catch (err) {
    console.error(err);
    setStatus('프로젝트 로드 실패: JSON/SMIXZ 형식 확인 필요');
  } finally {
    els.projectFileInput.value = '';
  }
}

async function loadProject() {
  if (window.electronAPI?.isElectron && window.electronAPI.openProjectFile) {
    const opened = await window.electronAPI.openProjectFile();
    if (!opened || !opened.buffer) return;
    const file = new File([opened.buffer], opened.name || 'project.json', {
      type: opened.name?.toLowerCase().endsWith('.smixz') ? 'application/gzip' : 'application/json'
    });
    await loadProjectFromFile(file);
    return;
  }
  els.projectFileInput.click();
}

function updateMaster() {
  const db = Number(els.masterVolume.value);
  els.masterVolumeValue.textContent = `${db.toFixed(1)} dB`;
  if (engine.masterGain && engine.ctx) {
    engine.masterGain.gain.setTargetAtTime(dbToGain(db), engine.ctx.currentTime, 0.01);
  }
}

function drawMeters() {
  if (!engine.analyser) {
    els.meterL.style.height = '0%';
    els.meterR.style.height = '0%';
    return;
  }

  const data = new Uint8Array(engine.analyser.fftSize);
  engine.analyser.getByteTimeDomainData(data);

  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i] - 128) / 128;
    if (v > peak) peak = v;
  }

  const pct = Math.min(100, peak * 100);
  const pctR = Math.min(100, pct * 0.94);
  state.meterHoldL = Math.max(state.meterHoldL * 0.985, pct);
  state.meterHoldR = Math.max(state.meterHoldR * 0.985, pctR);
  els.meterL.style.height = `${pct}%`;
  els.meterR.style.height = `${pctR}%`;
  if (els.meterHoldL) els.meterHoldL.style.bottom = `${state.meterHoldL}%`;
  if (els.meterHoldR) els.meterHoldR.style.bottom = `${state.meterHoldR}%`;
  if (els.peakDbL) els.peakDbL.textContent = formatDb(pct / 100);
  if (els.peakDbR) els.peakDbR.textContent = formatDb(pctR / 100);
  const limiterReduction = Math.abs(engine.masterLimiter?.reduction ?? 0);
  if (els.limiterReduction) els.limiterReduction.textContent = `${limiterReduction.toFixed(1)} dB`;
  if (peak >= 0.995) {
    state.clipHoldUntil = performance.now() + 1400;
  }
  if (els.clipIndicator) {
    const clipping = performance.now() < state.clipHoldUntil;
    els.clipIndicator.textContent = clipping ? 'CLIP' : 'SAFE';
    els.clipIndicator.classList.toggle('clip', clipping);
  }
}

function drawTrackMiniMeters() {
  for (const track of state.tracks) {
    const meter = state.trackMeterRuntime.get(track.id);
    const card = els.trackList.querySelector(`[data-track-id="${track.id}"]`);
    const dock = els.dockMixerTracks?.querySelector(`[data-track-id="${track.id}"]`);
    if (!card) continue;
    const fill = card.querySelector('[data-role="miniFill"]');
    const hold = card.querySelector('[data-role="miniHold"]');
    const dockFill = dock?.querySelector('[data-role="dockMiniFill"]') || null;
    const dockHold = dock?.querySelector('[data-role="dockMiniHold"]') || null;
    if (!fill || !hold) continue;

    let pct = 0;
    let holdPct = 0;
    if (meter?.analyser) {
      const data = new Uint8Array(meter.analyser.fftSize);
      meter.analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      pct = Math.min(100, peak * 100);
      meter.hold = Math.max((meter.hold || 0) * 0.98, pct);
      holdPct = meter.hold;
    } else {
      holdPct = 0;
    }

    fill.style.height = `${pct}%`;
    hold.style.bottom = `${holdPct}%`;
    if (dockFill) dockFill.style.height = `${pct}%`;
    if (dockHold) dockHold.style.bottom = `${holdPct}%`;
  }
}

function frame() {
  updateTimeAndSeek();
  applyAutomationRuntime();
  drawMeters();
  drawTrackMiniMeters();
  drawAutomationCurve();

  if (state.isPlaying && state.punchEnabled && state.loopIn !== null && state.loopOut !== null) {
    const now = getCurrentTime();
    if (now >= state.loopOut && !state.loopJumping) {
      state.loopJumping = true;
      state.playStartOffset = state.loopIn;
      playMix().finally(() => {
        state.loopJumping = false;
      });
      return;
    }
  }

  if (state.isPlaying && getCurrentTime() >= state.duration) {
    stopMix();
  }

  state.rafId = requestAnimationFrame(frame);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function hideWaveContextMenu() {
  els.waveContextMenu?.classList.add('hidden');
}

function hidePanelContextMenu() {
  els.panelContextMenu?.classList.add('hidden');
}

function showContextMenu(menu, x, y) {
  if (!menu) return;
  menu.classList.remove('hidden');

  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - margin;
  const maxY = window.innerHeight - rect.height - margin;
  const left = Math.max(margin, Math.min(x, maxX));
  const top = Math.max(margin, Math.min(y, maxY));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function showWaveContextMenu(x, y) {
  showContextMenu(els.waveContextMenu, x, y);
}

function showPanelContextMenu(x, y) {
  showContextMenu(els.panelContextMenu, x, y);
}

function bindWaveContextMenu() {
  const menu = els.waveContextMenu;
  if (!menu) return;

  const openMenu = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    hidePanelContextMenu();
    showWaveContextMenu(ev.clientX, ev.clientY);
  };

  els.waveCanvas?.addEventListener('contextmenu', openMenu);
  els.clipLane?.addEventListener('contextmenu', openMenu);

  menu.addEventListener('click', async (ev) => {
    const button = ev.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    hideWaveContextMenu();

    switch (action) {
      case 'playPause':
        if (state.isPlaying) pauseMix();
        else await playMix();
        break;
      case 'stop':
        stopMix();
        break;
      case 'loopIn':
        setLoopIn();
        break;
      case 'loopOut':
        setLoopOut();
        break;
      case 'export':
        await exportMix();
        break;
      case 'import':
        await importAudio();
        break;
      default:
        break;
    }
  });

  document.addEventListener('pointerdown', (ev) => {
    if (menu.classList.contains('hidden')) return;
    if (menu.contains(ev.target)) return;
    hideWaveContextMenu();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideWaveContextMenu();
  });

  window.addEventListener('resize', hideWaveContextMenu);
  window.addEventListener('blur', hideWaveContextMenu);
}

function bindPanelContextMenu() {
  const menu = els.panelContextMenu;
  if (!menu) return;

  const panelSelector = '.sidebar, .editor, .inspector-panel, .dock-mixer, .transport';
  const panels = document.querySelectorAll(panelSelector);
  const openMenu = (ev) => {
    if (ev.target.closest('#waveCanvas, #clipLane, #automationCanvas, #waveContextMenu')) return;
    ev.preventDefault();
    hideWaveContextMenu();
    showPanelContextMenu(ev.clientX, ev.clientY);
  };

  panels.forEach((panel) => {
    panel.addEventListener('contextmenu', openMenu);
  });

  menu.addEventListener('click', async (ev) => {
    const button = ev.target.closest('[data-action]');
    if (!button) return;

    hidePanelContextMenu();

    switch (button.dataset.action) {
      case 'import':
        await importAudio();
        break;
      case 'addTone':
        await addTestTone();
        break;
      case 'playPause':
        if (state.isPlaying) pauseMix();
        else await playMix();
        break;
      case 'stop':
        stopMix();
        break;
      case 'export':
        await exportMix();
        break;
      case 'saveProject':
        await saveProject();
        break;
      case 'loadProject':
        await loadProject();
        break;
      case 'toggleDock':
        els.btnToggleDock?.click();
        break;
      default:
        break;
    }
  });

  document.addEventListener('pointerdown', (ev) => {
    if (menu.classList.contains('hidden')) return;
    if (menu.contains(ev.target)) return;
    hidePanelContextMenu();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hidePanelContextMenu();
  });

  window.addEventListener('resize', hidePanelContextMenu);
  window.addEventListener('blur', hidePanelContextMenu);
}

function bindUi() {
  els.btnImport.addEventListener('click', importAudio);
  els.btnAddTone.addEventListener('click', addTestTone);
  els.btnSaveProject.addEventListener('click', saveProject);
  els.btnLoadProject.addEventListener('click', loadProject);
  els.projectFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0] || null;
    if (file) loadProjectFromFile(file);
  });
  els.btnExport.addEventListener('click', exportMix);
  els.btnStop.addEventListener('click', stopMix);
  els.btnSnapGrid?.addEventListener('click', () => {
    state.clipSnapEnabled = !state.clipSnapEnabled;
    els.btnSnapGrid.classList.toggle('active', state.clipSnapEnabled);
    applyLocalizedUi();
  });
  els.btnAutoCrossfade?.addEventListener('click', () => {
    state.autoCrossfadeEnabled = !state.autoCrossfadeEnabled;
    els.btnAutoCrossfade.classList.toggle('active', state.autoCrossfadeEnabled);
    applyLocalizedUi();
  });
  els.btnCurveMode?.addEventListener('click', () => {
    state.automationCurveMode = state.automationCurveMode === 'smooth' ? 'linear' : 'smooth';
    els.btnCurveMode.classList.toggle('active', state.automationCurveMode === 'smooth');
    applyLocalizedUi();
    drawAutomationCurve();
  });
  els.btnUiDensity?.addEventListener('click', () => {
    const nextDensity = state.uiDensity === 'compact' ? 'studio' : 'compact';
    applyUiDensity(nextDensity, true);
  });
  els.themeSelect?.addEventListener('change', () => {
    applyTheme(els.themeSelect.value, true);
  });
  els.languageSelect?.addEventListener('change', async () => {
    await I18n.load(els.languageSelect.value);
    applyLocalizedUi();
    setStatus(I18n.getLocale() === 'en' ? 'Language changed to English' : '언어가 한국어로 변경되었습니다');
  });
  els.btnToggleDock?.addEventListener('click', () => {
    state.dockVisible = !state.dockVisible;
    els.dockMixer?.classList.toggle('hidden', !state.dockVisible);
  });
  els.automationTarget?.addEventListener('change', () => {
    state.automationTarget = els.automationTarget.value;
    drawAutomationCurve();
  });
  els.btnAutomationReset?.addEventListener('click', () => {
    state.automationCurves[state.automationTarget] = [
      { x: 0, y: state.automationTarget === 'trackPan' ? 0.5 : 0.75 },
      { x: 1, y: state.automationTarget === 'trackPan' ? 0.5 : 0.75 }
    ];
    drawAutomationCurve();
  });
  els.btnRecArm.addEventListener('click', () => {
    state.recArmed = !state.recArmed;
    updateLoopUi();
    setStatus(state.recArmed ? 'REC Arm 활성화' : 'REC Arm 해제');
  });
  els.btnPunch.addEventListener('click', () => {
    state.punchEnabled = !state.punchEnabled;
    updateLoopUi();
    setStatus(state.punchEnabled ? 'Punch 모드 활성화' : 'Punch 모드 해제');
  });
  els.btnCueMonitor?.addEventListener('click', () => {
    state.cueMonitor = !state.cueMonitor;
    updateLoopUi();
    setStatus(state.cueMonitor ? 'CUE Monitor 활성화' : 'CUE Monitor 해제');
    if (state.isPlaying) {
      pauseMix();
      playMix();
    }
  });
  els.btnLoopIn.addEventListener('click', setLoopIn);
  els.btnLoopOut.addEventListener('click', setLoopOut);

  els.btnPlayPause.addEventListener('click', async () => {
    if (state.isPlaying) {
      pauseMix();
    } else {
      await playMix();
    }
  });

  els.seekBar.addEventListener('input', () => {
    const ratio = Number(els.seekBar.value);
    state.playStartOffset = state.duration * ratio;
    if (!state.isPlaying) updateTimeAndSeek();
  });

  els.seekBar.addEventListener('change', async () => {
    if (state.isPlaying) {
      await playMix();
    }
  });

  els.masterVolume.addEventListener('input', updateMaster);

  window.addEventListener('resize', () => {
    refreshSelectedTrackView();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (e.shiftKey) {
        stopMix();
      } else if (state.isPlaying) pauseMix();
      else playMix();
      return;
    }

    if (e.code === 'KeyI') {
      e.preventDefault();
      setLoopIn();
      return;
    }

    if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setLoopOut();
      return;
    }

    if (e.code === 'KeyO' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      importAudio();
      return;
    }

    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      exportMix();
    }
  });

  if (window.electronAPI?.isElectron) {
    window.electronAPI.onMenuOpenAudio(importAudio);
    window.electronAPI.onMenuSaveAudio(exportMix);
    window.electronAPI.onMenuOpenProject?.(loadProject);
    window.electronAPI.onMenuSaveProject?.(saveProject);
  }
}

async function init() {
  await I18n.init();
  if (els.languageSelect) {
    els.languageSelect.value = I18n.getLocale();
  }

  bindUi();
  bindAutomationUi();
  bindDockMixerScroll();
  bindWaveContextMenu();
  bindPanelContextMenu();
  restoreTheme();
  restoreUiDensity();
  applyLocalizedUi();

  window.addEventListener('i18n:change', () => {
    applyLocalizedUi();
    refreshLocalizedPanels();
  });

  if (els.automationTarget) {
    els.automationTarget.value = state.automationTarget;
  }
  if (els.btnSnapGrid) {
    els.btnSnapGrid.classList.toggle('active', state.clipSnapEnabled);
  }
  if (els.btnAutoCrossfade) {
    els.btnAutoCrossfade.classList.toggle('active', state.autoCrossfadeEnabled);
  }
  if (els.btnCurveMode) {
    els.btnCurveMode.classList.toggle('active', state.automationCurveMode === 'smooth');
  }
  applyLocalizedUi();
  updateTimeAndSeek();
  updateMaster();
  updateLoopUi();
  drawWaveform(null);
  drawAutomationCurve();
  renderClipLane();
  renderDockMixer();
  state.rafId = requestAnimationFrame(frame);
  setStatus('믹서 준비됨');
}

init().catch((err) => {
  console.error(err);
  setStatus('초기화 실패');
});

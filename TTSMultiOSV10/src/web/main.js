// ── Web-mode file open helper (used only when Electron bridge is absent) ─────
function webOpenTextFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.md,text/plain';
    let settled = false;
    input.onchange = async (e) => {
      if (settled) return;
      settled = true;
      const file = e.target.files?.[0];
      if (!file) { resolve(null); return; }
      const content = await file.text();
      resolve({ content, filePath: file.name });
    };
    input.click();
    // Chrome cancellation detection
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 500);
    }, { once: true });
  });
}

// ── Fallback bridge (web mode / Electron preload absent) ──────────────────────
const bridge = window.ttsBridge || {
  async getModelCatalog() {
    return [
      {
        id: 'ko-piper-kss', label: 'Piper KSS', language: 'ko-KR',
        sizeHint: '64 MB', runtime: 'piper-onnx',
        description: '경량 임베디드 최적 모델 (VITS 기반)',
        preferredOnFirstRun: false
      },
      {
        id: 'ko-supertonic-int8', label: 'Supertonic 3 INT8', language: 'ko-KR',
        sizeHint: '~140 MB', runtime: 'sherpa-onnx',
        description: 'Supertonic 3 · INT8 · 단어 skip 감소 · 31언어',
        preferredOnFirstRun: true
      },
      {
        id: 'ko-mms-tts', label: 'MMS TTS', language: 'ko-KR',
        sizeHint: '140 MB', runtime: 'transformers-js',
        description: 'Meta MMS · Transformers.js 호환'
      },
      {
        id: 'en-kokoro', label: 'Kokoro 82M', language: 'en-US',
        sizeHint: '~310 MB', runtime: 'onnx',
        description: '영어 고품질 TTS (ONNX)'
      }
    ];
  },
  async downloadAndPrepareModel() { return null; },
  async getCachedModels()         { return []; },
  async selectWavPath()           { return null; },
  async exportWav()               { return null; },
  async openTextFile()            { return webOpenTextFile(); },
  async speak({ text }) {
    const sampleRate = 22050;
    const length = Math.max(sampleRate, String(text || '').length * 1200);
    const audioBuffer = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      audioBuffer[i] = Math.sin(2 * Math.PI * 220 * t) * 0.08
                     + Math.sin(2 * Math.PI * 440 * t) * 0.04
                     + Math.sin(2 * Math.PI * 880 * t) * 0.02;
    }
    return { audioBuffer: Array.from(audioBuffer), sampleRate, text };
  },
  onModelDownloadProgress(_cb) {
    return () => {};
  }
};

// ── App state ────────────────────────────────────────────────────────────────
const state = {
  models: [],
  lastResult: null,
  audioContext: null,
  currentSource: null,
  currentGain: null,
  waveformImageData: null,
  waveformMeta: null,
  rafId: null,
  // Playback transport
  playStatus: 'idle', // idle | playing | paused
  playGen: 0,
  pcm: null,
  pcmSampleRate: 22050,
  audioBuffer: null,
  bufferOffsetSec: 0,
  contextStartSec: 0,
  speedFactor: 1,
  scrubbing: false,
  wasPlayingBeforeScrub: false,
  synthKey: '',
  synthesizing: false,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const textInput          = document.getElementById('textInput');
const languageSelect     = document.getElementById('languageSelect');
const modelSelect        = document.getElementById('modelSelect');
const statusText         = document.getElementById('statusText');
const statusProgressBar  = document.getElementById('statusProgressBar');
const statusProgressLabel = document.getElementById('statusProgressLabel');
const statusBarMessage   = document.getElementById('statusBarMessage');
const statusBarLanguage  = document.getElementById('statusBarLanguage');
const statusBarModel     = document.getElementById('statusBarModel');
const statusBarCache     = document.getElementById('statusBarCache');
const statusBarFill      = document.getElementById('statusBarFill');
const statusDot          = document.getElementById('statusDot');
const statusCard         = document.getElementById('statusCard');
const dlPercent          = document.getElementById('dlPercent');
const dlFile             = document.getElementById('dlFile');
const dlBarFill          = document.getElementById('dlBarFill');
const dlSize             = document.getElementById('dlSize');
const voiceSelect        = document.getElementById('voiceSelect');
const volumeRange        = document.getElementById('volumeRange');
const speedRange         = document.getElementById('speedRange');
const pitchRange         = document.getElementById('pitchRange');
const volumeLabel        = document.getElementById('volumeLabel');
const speedLabel         = document.getElementById('speedLabel');
const pitchLabel         = document.getElementById('pitchLabel');
const waveformSection    = document.getElementById('waveformSection');
const waveformCanvas     = document.getElementById('waveformCanvas');
const waveformCurrent    = document.getElementById('waveformCurrent');
const waveformDuration   = document.getElementById('waveformDuration');
const waveformEmpty      = document.getElementById('waveformEmpty');
const waveformVoiceLabel = document.getElementById('waveformVoiceLabel');
const errorDialog        = document.getElementById('errorDialog');
const errorDetails       = document.getElementById('errorDetails');
const copyError          = document.getElementById('copyError');

const AUDIO_DEFAULTS_KEY = 'tts-audio-defaults';
const DEFAULT_AUDIO_SETTINGS = {
  volume: 100,
  speed: 100,
  pitch: 0,
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function readCurrentAudioSettings() {
  return {
    volume: clampNumber(volumeRange?.value, 0, 200, DEFAULT_AUDIO_SETTINGS.volume),
    speed: clampNumber(speedRange?.value, 25, 400, DEFAULT_AUDIO_SETTINGS.speed),
    pitch: clampNumber(pitchRange?.value, -12, 12, DEFAULT_AUDIO_SETTINGS.pitch),
  };
}

function syncAudioParamLabels() {
  if (volumeLabel && volumeRange) volumeLabel.textContent = `${volumeRange.value}%`;
  if (speedLabel && speedRange) speedLabel.textContent = `${(Number(speedRange.value) / 100).toFixed(2)}×`;
  if (pitchLabel && pitchRange) {
    const v = Number(pitchRange.value);
    pitchLabel.textContent = v === 0 ? '±0' : (v > 0 ? `+${v}` : `${v}`);
  }
}

function applyAudioSettings(settings) {
  if (volumeRange) volumeRange.value = String(clampNumber(settings?.volume, 0, 200, DEFAULT_AUDIO_SETTINGS.volume));
  if (speedRange) speedRange.value = String(clampNumber(settings?.speed, 25, 400, DEFAULT_AUDIO_SETTINGS.speed));
  if (pitchRange) pitchRange.value = String(clampNumber(settings?.pitch, -12, 12, DEFAULT_AUDIO_SETTINGS.pitch));
  syncAudioParamLabels();
  applyLiveVolume();
  applyLiveSpeed();
  applyLivePitch();
}

function loadAudioDefaults() {
  try {
    const raw = localStorage.getItem(AUDIO_DEFAULTS_KEY);
    if (!raw) {
      applyAudioSettings(DEFAULT_AUDIO_SETTINGS);
      return;
    }
    const parsed = JSON.parse(raw);
    applyAudioSettings(parsed);
  } catch {
    applyAudioSettings(DEFAULT_AUDIO_SETTINGS);
  }
}

function saveAudioDefaults() {
  const settings = readCurrentAudioSettings();
  localStorage.setItem(AUDIO_DEFAULTS_KEY, JSON.stringify(settings));
  showStatus('볼륨, 속도, 피치를 기본값으로 저장했습니다.');
}

// ── Theme ────────────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('tts-theme', theme);
  // Redraw waveform so baseline / axis colors match the theme
  if (state.lastResult?.audioBuffer?.length) {
    drawWaveform(
      Float32Array.from(state.lastResult.audioBuffer),
      state.lastResult.sampleRate || 22050,
    );
    syncPlayheadUi();
  }
}

function cycleTheme() {
  applyTheme(localStorage.getItem('tts-theme') === 'light' ? 'dark' : 'light');
}

applyTheme(localStorage.getItem('tts-theme') || 'dark');
themeToggle?.addEventListener('click', cycleTheme);
loadAudioDefaults();

/** Clear canvas cache and show overlay until real PCM is ready. */
function clearWaveform(message) {
  state.waveformImageData = null;
  state.waveformMeta = null;
  waveformCanvas?.classList.remove('has-audio');
  if (waveformCanvas) {
    const ctx = waveformCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  }
  if (waveformCurrent) waveformCurrent.textContent = '0:00';
  if (waveformDuration) waveformDuration.textContent = '-:--';
  if (waveformEmpty) {
    waveformEmpty.textContent = message
      || '▶ 읽기 버튼을 누르면 파형이 표시됩니다.';
    waveformEmpty.classList.remove('hidden');
  }
}

// ── Waveform accent colors (resolve CSS vars per theme) ──────────────────────
function getWaveformColors() {
  const styles = getComputedStyle(document.documentElement);
  const css = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (document.documentElement.getAttribute('data-theme') !== 'light'
        && !window.matchMedia('(prefers-color-scheme: light)').matches);
  return isDark
    ? {
        fill: '#5ed7c0',
        strong: '#7ac7ff',
        played: 'rgba(94, 215, 192, 0.15)',
        cursor: '#ff3b3b',
        baseline: css('--waveform-baseline', 'rgba(255, 255, 255, 0.55)'),
        axis: css('--waveform-axis', 'rgba(255, 255, 255, 0.38)'),
        tick: css('--waveform-tick', 'rgba(255, 255, 255, 0.55)'),
        tickLabel: css('--waveform-tick-label', 'rgba(200, 210, 224, 0.92)'),
      }
    : {
        fill: '#147d72',
        strong: '#3464ff',
        played: 'rgba(20, 125, 114, 0.12)',
        cursor: '#e01010',
        baseline: css('--waveform-baseline', 'rgba(12, 26, 40, 0.55)'),
        axis: css('--waveform-axis', 'rgba(12, 26, 40, 0.28)'),
        tick: css('--waveform-tick', 'rgba(12, 26, 40, 0.5)'),
        tickLabel: css('--waveform-tick-label', 'rgba(40, 55, 70, 0.9)'),
      };
}

function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/** Axis labels: show tenths for short durations */
function formatAxisTime(seconds) {
  const s = Math.max(0, seconds);
  if (s < 60 && Math.abs(s - Math.round(s)) > 0.001) {
    return `${s.toFixed(1)}s`;
  }
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function chooseTimeTickStep(durationSec) {
  const nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  // Aim for roughly 6–12 major ticks across the width
  const target = durationSec / 8;
  let step = nice[nice.length - 1];
  for (const n of nice) {
    if (n >= target) { step = n; break; }
  }
  return step;
}

function drawTimeAxis(ctx, w, axisY, plotBottom, durationSec, colors) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return;

  const axisH = plotBottom - axisY;
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, axisY);
  ctx.lineTo(w, axisY);
  ctx.stroke();

  const major = chooseTimeTickStep(durationSec);
  const minor = major / 5;
  const pad = 4;

  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = colors.tickLabel;
  ctx.textBaseline = 'top';

  // Minor ticks
  if (minor > 0) {
    ctx.strokeStyle = colors.axis;
    ctx.globalAlpha = 0.55;
    for (let t = 0; t <= durationSec + 1e-9; t += minor) {
      const x = (t / durationSec) * w;
      const isMajor = Math.abs((t / major) - Math.round(t / major)) < 1e-6;
      if (isMajor) continue;
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + Math.max(4, axisH * 0.28));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Major ticks + labels
  ctx.strokeStyle = colors.tick;
  for (let t = 0; t <= durationSec + 1e-9; t += major) {
    const x = (t / durationSec) * w;
    ctx.beginPath();
    ctx.moveTo(x, axisY);
    ctx.lineTo(x, axisY + Math.max(7, axisH * 0.45));
    ctx.stroke();

    const label = formatAxisTime(t);
    if (x < pad) {
      ctx.textAlign = 'left';
      ctx.fillText(label, pad, axisY + 9);
    } else if (x > w - pad) {
      ctx.textAlign = 'right';
      ctx.fillText(label, w - pad, axisY + 9);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(label, x, axisY + 9);
    }
  }

  // End label if last major didn't land on duration
  const remainder = durationSec % major;
  if (remainder > major * 0.15 && Math.abs(remainder - major) > 1e-6) {
    ctx.textAlign = 'right';
    ctx.fillText(formatAxisTime(durationSec), w - pad, axisY + 9);
    ctx.strokeStyle = colors.tick;
    ctx.beginPath();
    ctx.moveTo(w - 0.5, axisY);
    ctx.lineTo(w - 0.5, axisY + Math.max(7, axisH * 0.45));
    ctx.stroke();
  }
}

function drawWaveform(samples, sampleRate) {
  if (!waveformCanvas || !samples?.length) return;

  if (waveformEmpty) waveformEmpty.classList.add('hidden');

  const dpr  = window.devicePixelRatio || 1;
  const rect = waveformCanvas.getBoundingClientRect();
  const W    = Math.floor(rect.width  * dpr) || Math.floor(waveformCanvas.offsetWidth  * dpr) || 1400;
  const H    = Math.floor(rect.height * dpr) || Math.floor(waveformCanvas.offsetHeight * dpr) || 148;

  waveformCanvas.width  = W;
  waveformCanvas.height = H;

  const ctx = waveformCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = W / dpr;
  const h = H / dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const axisBand = 28; // px reserved for time axis
  const plotTop = 4;
  const plotBottom = h - axisBand;
  const plotH = Math.max(24, plotBottom - plotTop);
  const mid = plotTop + plotH / 2;
  const amp = plotH * 0.42;

  const step = samples.length / w;
  const colors = getWaveformColors();
  const durationSec = samples.length / sampleRate;

  // Centre baseline (zero line) — theme-aware, high visibility
  ctx.strokeStyle = colors.baseline;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
  ctx.setLineDash([]);

  // Waveform strokes
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, colors.fill);
  grad.addColorStop(1, colors.strong);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * step);
    const end   = Math.min(start + Math.max(1, Math.ceil(step)), samples.length);
    let min = 0, max = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, mid + min * amp);
    ctx.lineTo(x, mid + max * amp);
  }
  ctx.stroke();

  drawTimeAxis(ctx, w, plotBottom, h, durationSec, colors);

  state.waveformImageData = ctx.getImageData(0, 0, W, H);
  state.waveformMeta = {
    durationSec,
    sampleRate,
    plotTop,
    plotBottom,
    plotH,
  };

  if (waveformDuration) waveformDuration.textContent = formatTime(durationSec);
  if (waveformCurrent) {
    const progress = getPlaybackProgress();
    waveformCurrent.textContent = formatTime(progress * durationSec);
  }
  waveformCanvas?.classList.add('has-audio');
}

function drawPlayheadAt(progress) {
  if (!waveformCanvas || !state.waveformImageData) return;
  const ctx = waveformCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = waveformCanvas.width;
  const H = waveformCanvas.height;
  const w = W / dpr;
  const h = H / dpr;
  const meta = state.waveformMeta || {};
  const plotBottom = meta.plotBottom ?? (h - 28);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(state.waveformImageData, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const x = Math.max(0, Math.min(1, progress)) * w;
  const colors = getWaveformColors();

  // Tint only the waveform band (keep time axis readable)
  ctx.fillStyle = colors.played;
  ctx.fillRect(0, 0, x, plotBottom);

  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, plotBottom);
  ctx.strokeStyle = colors.cursor;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function stopTransportAnimation() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function startTransportAnimation() {
  stopTransportAnimation();
  const context = getAudioContext();
  if (!context) return;

  function tick() {
    if (state.playStatus !== 'playing' || state.scrubbing) {
      state.rafId = null;
      return;
    }
    const progress = getPlaybackProgress();
    const durationSec = state.audioBuffer
      ? state.audioBuffer.duration / Math.max(0.01, state.speedFactor)
      : (state.waveformMeta?.durationSec || 0);
    drawPlayheadAt(progress);
    if (waveformCurrent) {
      waveformCurrent.textContent = formatTime(progress * durationSec);
    }
    if (progress >= 0.999) {
      state.rafId = null;
      return;
    }
    state.rafId = requestAnimationFrame(tick);
  }

  state.rafId = requestAnimationFrame(tick);
}

// ── Download progress display ────────────────────────────────────────────────
function setDownloadPhase(active) {
  if (statusCard) statusCard.dataset.phase = active ? 'downloading' : '';
}

function updateDlPanel(percent, fileName, receivedMB, totalMB) {
  if (dlPercent) dlPercent.textContent = `${percent}%`;
  if (dlBarFill) dlBarFill.style.width = `${percent}%`;
  if (dlFile) dlFile.textContent = fileName ? fileName.split('/').pop() : '';
  if (dlSize) {
    dlSize.textContent = totalMB
      ? `${receivedMB} / ${totalMB} MB`
      : receivedMB ? `${receivedMB} MB` : '';
  }
}

// ── Status helpers ───────────────────────────────────────────────────────────
function showStatus(message) {
  if (statusText)       statusText.textContent = message;
  if (statusBarMessage) statusBarMessage.textContent = message;
}

function showProgress(percent = 0) {
  const v = Math.max(0, Math.min(100, Number(percent) || 0));
  if (statusProgressBar)   statusProgressBar.style.width   = `${v}%`;
  if (statusProgressLabel) statusProgressLabel.textContent = `${v}%`;
  if (statusBarFill)       statusBarFill.style.width       = `${v}%`;
}

function setPhase(phase) {
  if (statusDot) statusDot.dataset.phase = phase;
  if (statusBarFill) {
    statusBarFill.dataset.phase = phase;
    if (phase === 'idle') statusBarFill.style.width = '0%';
  }
  if (phase !== 'downloading') setDownloadPhase(false);
}

function updateStatusBarModel(model) {
  if (statusBarModel) statusBarModel.textContent = model ? `${model.label} (${model.language})` : '-';
}

function updateStatusBarLanguage() {
  if (statusBarLanguage) statusBarLanguage.textContent = languageSelect.value;
}

function updateStatusBarCache(text) {
  if (statusBarCache) statusBarCache.textContent = text;
}

// ── Download progress listener ───────────────────────────────────────────────
if (typeof bridge.onModelDownloadProgress === 'function') {
  bridge.onModelDownloadProgress((progress) => {
    if (!progress) return;

    if (progress.phase === 'start') {
      setPhase('downloading');
      setDownloadPhase(true);
      updateDlPanel(0, '', null, null);
      showProgress(0);
      showStatus(`${progress.model?.label || '모델'} 다운로드를 시작합니다.`);
      return;
    }

    if (progress.phase === 'download') {
      const label      = progress.model?.label || '모델';
      const percent    = Number.isFinite(progress.percent) ? progress.percent : 0;
      const receivedMB = progress.receivedBytes ? (progress.receivedBytes / 1024 / 1024).toFixed(1) : null;
      const totalMB    = progress.totalBytes    ? (progress.totalBytes    / 1024 / 1024).toFixed(1) : null;
      const fileName   = progress.fileName || '';

      setPhase('downloading');
      setDownloadPhase(true);
      updateDlPanel(percent, fileName, receivedMB, totalMB);
      showProgress(percent);
      showStatus(`${label} 다운로드 중... ${percent}%`);
      return;
    }

    if (progress.phase === 'done') {
      showProgress(100);
      setDownloadPhase(false);
      if (progress.downloaded) {
        setPhase('done');
        showStatus(`${progress.model?.label || '모델'} 다운로드 완료`);
        setTimeout(() => setPhase('idle'), 2500);
      } else {
        setPhase('idle');
        showStatus(`${progress.model?.label || '모델'}이 이미 다운로드되어 있습니다.`);
      }
    }
  });
}

// ── Audio context ────────────────────────────────────────────────────────────
function getAudioContext() {
  if (!state.audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    state.audioContext = Ctor ? new Ctor() : null;
  }
  return state.audioContext;
}

const pauseBtn = document.getElementById('pausePlayback');
const stopBtn  = document.getElementById('stopPlayback');
const speakBtn = document.getElementById('speakText');

function updateTransportButtons() {
  const hasAudio = !!(state.pcm?.length || state.lastResult?.audioBuffer?.length);
  const playing  = state.playStatus === 'playing';
  const paused   = state.playStatus === 'paused';
  if (pauseBtn) pauseBtn.disabled = !playing || state.synthesizing;
  if (stopBtn)  stopBtn.disabled  = (!playing && !paused && !hasAudio) || state.synthesizing;
  if (speakBtn) speakBtn.disabled = state.synthesizing;

  const menu = document.getElementById('waveformContextMenu');
  if (!menu) return;
  const setDisabled = (action, disabled) => {
    const el = menu.querySelector(`[data-action="${action}"]`);
    if (el) el.disabled = !!disabled;
  };
  setDisabled('play', state.synthesizing);
  setDisabled('pause', !playing || state.synthesizing);
  setDisabled('stop', (!playing && !paused && !hasAudio) || state.synthesizing);
  setDisabled('seek-here', !hasAudio || state.synthesizing);
  setDisabled('seek-start', !hasAudio || state.synthesizing);
  setDisabled('seek-end', !hasAudio || state.synthesizing);
  setDisabled('save-wav', !hasAudio || state.synthesizing);
}

function getPlaybackProgress() {
  if (!state.audioBuffer) {
    const duration = state.waveformMeta?.durationSec || 0;
    if (!duration) return 0;
    return Math.max(0, Math.min(1, state.bufferOffsetSec / duration));
  }
  const bufDur = state.audioBuffer.duration;
  if (bufDur <= 0) return 0;

  let pos = state.bufferOffsetSec;
  if (state.playStatus === 'playing' && state.audioContext && !state.scrubbing) {
    const elapsed = (state.audioContext.currentTime - state.contextStartSec) * state.speedFactor;
    pos = state.bufferOffsetSec + elapsed;
  }
  return Math.max(0, Math.min(1, pos / bufDur));
}

function syncPlayheadUi() {
  const progress = getPlaybackProgress();
  drawPlayheadAt(progress);
  const timelineDur = state.waveformMeta?.durationSec
    ?? (state.pcm ? state.pcm.length / state.pcmSampleRate : 0);
  if (waveformCurrent) {
    waveformCurrent.textContent = formatTime(progress * timelineDur);
  }
}

function hardStopSource() {
  if (state.currentSource) {
    try {
      state.currentSource.onended = null;
      state.currentSource.stop();
    } catch { /* already stopped */ }
    try { state.currentSource.disconnect(); } catch { /**/ }
    state.currentSource = null;
  }
  if (state.currentGain) {
    try { state.currentGain.disconnect(); } catch { /**/ }
    state.currentGain = null;
  }
}

function buildPlaybackBuffer(pcm, sampleRate) {
  const context = getAudioContext();
  if (!context) throw new Error('Audio playback is not supported in this environment.');
  const data = pcm instanceof Float32Array ? pcm : Float32Array.from(pcm || []);
  if (!data.length) throw new Error('No audio samples were generated.');

  // Keep native sample rate; pitch uses detune, speed uses playbackRate (live-adjustable)
  const buffer = context.createBuffer(1, data.length, sampleRate);
  buffer.copyToChannel(data, 0);
  return buffer;
}

function readSpeedFactor() {
  return Math.max(0.05, Number(speedRange?.value ?? 100) / 100);
}

function readPitchCents() {
  return Number(pitchRange?.value ?? 0) * 100;
}

function freezePlaybackPosition() {
  const context = getAudioContext();
  if (!context || !state.audioBuffer || state.playStatus !== 'playing') return;
  const elapsed = (context.currentTime - state.contextStartSec) * state.speedFactor;
  state.bufferOffsetSec = Math.min(
    state.audioBuffer.duration,
    Math.max(0, state.bufferOffsetSec + elapsed),
  );
  state.contextStartSec = context.currentTime;
}

function applyLiveVolume() {
  if (state.currentGain) {
    state.currentGain.gain.value = Number(volumeRange?.value ?? 100) / 100;
  }
}

function applyLiveSpeed() {
  const next = readSpeedFactor();
  if (state.playStatus === 'playing' && state.currentSource) {
    freezePlaybackPosition();
    state.currentSource.playbackRate.value = next;
    state.speedFactor = next;
  } else {
    state.speedFactor = next;
  }
}

function applyLivePitch() {
  if (state.currentSource) {
    try {
      state.currentSource.detune.value = readPitchCents();
    } catch { /* detune unsupported */ }
  }
}

function preparePcm(samples, sampleRate) {
  const data = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  state.pcm = data;
  state.pcmSampleRate = sampleRate;
  state.audioBuffer = buildPlaybackBuffer(data, sampleRate);
  drawWaveform(data, sampleRate);
}

async function startPlaybackFrom(progress = 0) {
  const context = getAudioContext();
  if (!context) throw new Error('Audio playback is not supported in this environment.');
  if (!state.pcm?.length) throw new Error('재생할 오디오가 없습니다.');

  if (context.state === 'suspended') await context.resume();

  if (!state.audioBuffer || state.audioBuffer.length !== state.pcm.length) {
    state.audioBuffer = buildPlaybackBuffer(state.pcm, state.pcmSampleRate);
  }
  const buffer = state.audioBuffer;
  const speedFactor = readSpeedFactor();
  const volume = Number(volumeRange?.value ?? 100) / 100;
  const pitchCents = readPitchCents();

  const p = Math.max(0, Math.min(0.999, progress));
  const offsetSec = p * buffer.duration;
  if (offsetSec >= buffer.duration - 0.01) {
    return startPlaybackFrom(0);
  }

  hardStopSource();
  stopTransportAnimation();
  state.playGen += 1;
  const gen = state.playGen;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = speedFactor;
  try { source.detune.value = pitchCents; } catch { /* ignore */ }

  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(context.destination);

  state.currentSource = source;
  state.currentGain = gain;
  state.speedFactor = speedFactor;
  state.bufferOffsetSec = offsetSec;
  state.contextStartSec = context.currentTime;
  state.playStatus = 'playing';
  updateTransportButtons();

  source.onended = () => {
    if (gen !== state.playGen) return;
    if (state.playStatus === 'playing' && !state.scrubbing) {
      state.playStatus = 'idle';
      state.bufferOffsetSec = 0;
      state.currentSource = null;
      state.currentGain = null;
      stopTransportAnimation();
      drawPlayheadAt(0);
      if (waveformCurrent) waveformCurrent.textContent = '0:00';
      setPhase('done');
      showStatus('읽기 완료.');
      updateTransportButtons();
      setTimeout(() => { if (state.playStatus === 'idle') setPhase('idle'); }, 2000);
    }
  };

  source.start(0, offsetSec);
  setPhase('speaking');
  showStatus('재생 중...');
  startTransportAnimation();
  syncPlayheadUi();
}

function pausePlayback() {
  if (state.playStatus !== 'playing') return;
  const context = getAudioContext();
  if (context && state.audioBuffer) {
    const elapsed = (context.currentTime - state.contextStartSec) * state.speedFactor;
    state.bufferOffsetSec = Math.min(
      state.audioBuffer.duration,
      state.bufferOffsetSec + Math.max(0, elapsed),
    );
  }
  state.playGen += 1;
  hardStopSource();
  stopTransportAnimation();
  state.playStatus = 'paused';
  syncPlayheadUi();
  setPhase('idle');
  showStatus('멈춤.');
  updateTransportButtons();
}

function stopPlayback() {
  state.playGen += 1;
  hardStopSource();
  stopTransportAnimation();
  state.playStatus = 'idle';
  state.bufferOffsetSec = 0;
  syncPlayheadUi();
  drawPlayheadAt(0);
  if (waveformCurrent) waveformCurrent.textContent = '0:00';
  setPhase('idle');
  showStatus(state.pcm?.length ? '중단됨. 읽기를 누르면 다시 재생됩니다.' : '대기 중');
  updateTransportButtons();
}

function seekToProgress(progress, { resumeIfWasPlaying = false } = {}) {
  if (!state.pcm?.length && !state.lastResult?.audioBuffer?.length) return;
  if (!state.pcm?.length && state.lastResult?.audioBuffer) {
    preparePcm(state.lastResult.audioBuffer, state.lastResult.sampleRate);
  }

  const p = Math.max(0, Math.min(1, progress));
  const shouldResume = resumeIfWasPlaying && !state.scrubbing;

  if (state.playStatus === 'playing') {
    state.playGen += 1;
    hardStopSource();
    stopTransportAnimation();
    state.playStatus = 'paused';
  }

  if (!state.audioBuffer && state.pcm?.length) {
    state.audioBuffer = buildPlaybackBuffer(state.pcm, state.pcmSampleRate);
  }
  if (!state.audioBuffer) return;

  state.bufferOffsetSec = p * state.audioBuffer.duration;
  if (state.playStatus === 'idle' && state.bufferOffsetSec > 0) {
    state.playStatus = 'paused';
  }

  syncPlayheadUi();
  updateTransportButtons();

  if (shouldResume) {
    startPlaybackFrom(p);
  }
}

function canvasProgressFromEvent(e) {
  const rect = waveformCanvas.getBoundingClientRect();
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
}

// ── Model voice list management ───────────────────────────────────────────────
async function refreshVoiceList() {
  if (!voiceSelect) return;

  const modelId = modelSelect?.value || '';
  const model = state.models.find((m) => m.id === modelId);
  const prev = voiceSelect.value;
  voiceSelect.innerHTML = '';

  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = model
    ? `— ${model.label} 기본 목소리 —`
    : '— 모델 기본 목소리 —';
  voiceSelect.appendChild(defOpt);

  let voices = [];
  if (model?.downloaded && bridge.listModelVoices) {
    try {
      voices = await bridge.listModelVoices(modelId) || [];
    } catch (err) {
      console.warn('[TTS] 모델 목소리 목록 실패:', err?.message || err);
    }
  }

  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.label || v.id;
    voiceSelect.appendChild(opt);
  }

  if (prev && voices.some((v) => v.id === prev)) {
    voiceSelect.value = prev;
  } else if (voices.length > 0) {
    // Prefer af_heart for Kokoro; otherwise first voice
    const preferred = voices.find((v) => v.id === 'af_heart') || voices[0];
    voiceSelect.value = preferred.id;
  }

  if (waveformVoiceLabel) {
    const selected = voices.find((v) => v.id === voiceSelect.value);
    waveformVoiceLabel.textContent = selected
      ? `${model?.label || modelId} · ${selected.label}`
      : (model?.label || languageSelect?.value || '');
  }
}

// ── Web Speech API synthesis ─────────────────────────────────────────────────
function speakWithWebSpeech(text, lang, { rate, volume, pitch }, onBoundary) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('이 환경에서는 Web Speech API를 지원하지 않습니다.'));
      return;
    }
    window.speechSynthesis.cancel();

    const utt    = new SpeechSynthesisUtterance(text);
    utt.lang     = lang;
    utt.rate     = Math.max(0.1, Math.min(10, rate));
    utt.volume   = Math.max(0, Math.min(1, volume));
    utt.pitch    = Math.max(0, Math.min(2, pitch));

    // Use directly selected voice
    const selectedName = voiceSelect?.value;
    const voice = selectedName
      ? window.speechSynthesis.getVoices().find((v) => v.name === selectedName)
      : null;
    if (voice) utt.voice = voice;

    if (waveformVoiceLabel) {
      waveformVoiceLabel.textContent = voice?.name ?? lang;
    }

    utt.onboundary = (ev) => {
      if (typeof onBoundary === 'function') onBoundary(ev);
    };
    utt.onend   = () => resolve();
    utt.onerror = (ev) => {
      if (ev.error === 'interrupted' || ev.error === 'canceled') { resolve(); return; }
      reject(new Error(`음성 합성 오류: ${ev.error}`));
    };
    window.speechSynthesis.speak(utt);
  });
}

// ── Voice param slider wiring (live apply while playing) ─────────────────────
volumeRange?.addEventListener('input', () => {
  if (volumeLabel) volumeLabel.textContent = `${volumeRange.value}%`;
  applyLiveVolume();
});

speedRange?.addEventListener('input', () => {
  if (speedLabel) speedLabel.textContent = `${(Number(speedRange.value) / 100).toFixed(2)}×`;
  applyLiveSpeed();
});

pitchRange?.addEventListener('input', () => {
  const v = Number(pitchRange.value);
  if (pitchLabel) pitchLabel.textContent = v === 0 ? '±0' : (v > 0 ? `+${v}` : `${v}`);
  applyLivePitch();
});

// ── Error dialog ─────────────────────────────────────────────────────────────
function showError(error) {
  if (errorDetails) {
    errorDetails.textContent = typeof error === 'string'
      ? error
      : `${error?.message || 'Unknown error'}\n\n${error?.stack || ''}`;
  }
  if (errorDialog) {
    if (errorDialog.open) errorDialog.close();
    errorDialog.showModal();
  }
}

// ── Model list ───────────────────────────────────────────────────────────────
function getPreferredModelForLanguage(language) {
  if (!language) return null;
  return state.models.find((m) => m.language === language && m.preferredOnFirstRun)
    || state.models.find((m) => m.language === language)
    || null;
}

async function refreshModels() {
  try {
    const [catalog, cachedModels] = await Promise.all([
      bridge.getModelCatalog(),
      bridge.getCachedModels ? bridge.getCachedModels() : []
    ]);
    const cachedById = new Map((cachedModels || []).map((m) => [m.id, m]));
    state.models = catalog.map((m) => ({
      ...m,
      downloaded: cachedById.get(m.id)?.downloaded || false
    }));

    const previousModelId = modelSelect.value;

    modelSelect.innerHTML = '';
    for (const m of state.models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      const size   = m.sizeHint ? ` · ${m.sizeHint}` : '';
      const status = m.downloaded ? ' ✓ 설치됨' : ' · 미설치';
      opt.textContent = `${m.label} (${m.language})${size}${status}`;
      modelSelect.appendChild(opt);
    }

    const downloadedCount = state.models.filter((m) => m.downloaded).length;
    if (previousModelId && state.models.find((m) => m.id === previousModelId)) {
      modelSelect.value = previousModelId;
    } else {
      const available = state.models.find((m) => m.language === languageSelect.value && m.downloaded)
        || state.models.find((m) => m.downloaded)
        || null;
      const preferred = getPreferredModelForLanguage(languageSelect.value);
      modelSelect.value = preferred?.id
        || available?.id
        || state.models[0]?.id || '';
    }

    updateStatusBarModel(state.models.find((m) => m.id === modelSelect.value) || null);
    updateStatusBarLanguage();
    updateStatusBarCache(`${downloadedCount}/${state.models.length} 설치됨`);
    showProgress(0);
    showStatus(downloadedCount === 0
      ? `설치된 모델이 없습니다. 모델을 선택하고 다운로드 버튼을 누르세요. (${state.models.length}개 항목)`
      : `모델 ${state.models.length}개 중 ${downloadedCount}개가 설치되어 있습니다.`);
    await refreshVoiceList();
    // Background-preload current model so first Speak is snappy (esp. Kokoro)
    warmSelectedModel();
  } catch (error) {
    setPhase('error');
    showError(error);
  }
}

function currentSynthKey() {
  const text = textInput?.value ?? '';
  const modelId = modelSelect?.value || '';
  const voiceId = voiceSelect?.value || '';
  // Speed/pitch are playback params — not part of synthesis key
  return `${modelId}|${voiceId}|${text}`;
}

// ── Speak / synthesize ───────────────────────────────────────────────────────
async function synthesizeCurrentText() {
  const text = textInput?.value ?? '';
  if (!text.trim()) {
    throw new Error('읽을 텍스트를 입력하세요.');
  }

  const lang    = languageSelect?.value ?? 'ko-KR';
  const rate    = Number(speedRange?.value ?? 100) / 100;
  const modelId = modelSelect?.value || '';
  const model   = state.models.find((m) => m.id === modelId);
  const voiceId = voiceSelect?.value || '';

  if (!window.ttsBridge) {
    throw new Error('모델 합성은 Electron 앱에서만 지원됩니다.\nnpm start 로 실행하세요.');
  }
  if (!model) throw new Error('모델을 선택하세요.');
  if (!model.downloaded) {
    throw new Error(`${model.label} 모델이 설치되어 있지 않습니다.\n다운로드 후 다시 시도하세요.`);
  }

  stopPlayback();
  window.speechSynthesis?.cancel();

  state.synthesizing = true;
  updateTransportButtons();
  setPhase('speaking');
  showStatus(`${model.label} 모델 합성 중...`);
  // Do not draw a fake waveform while waiting — only show real PCM.
  clearWaveform(`${model.label} 합성 중…`);

  try {
    const result = await bridge.speak({
      text,
      modelId,
      voiceId: voiceId || undefined,
      speed: rate,
      language: model.language || lang,
    });

    if (!result?.audioBuffer?.length) {
      throw new Error(`${model.label} 합성 결과가 비어 있습니다.`);
    }

    state.lastResult = {
      audioBuffer: result.audioBuffer,
      sampleRate: result.sampleRate,
      text,
    };
    state.synthKey = currentSynthKey();
    preparePcm(result.audioBuffer, result.sampleRate);
    state.bufferOffsetSec = 0;

    const voiceLabel = voiceId
      ? `${model.label} · ${voiceSelect?.selectedOptions?.[0]?.textContent || voiceId}`
      : model.label;
    if (waveformVoiceLabel) waveformVoiceLabel.textContent = voiceLabel;

    return model;
  } catch (err) {
    clearWaveform('합성에 실패했습니다. 다시 시도해 주세요.');
    throw err;
  } finally {
    state.synthesizing = false;
    updateTransportButtons();
  }
}

async function speakText() {
  try {
    // Resume from pause without re-synthesize
    if (state.playStatus === 'paused' && state.pcm?.length && state.synthKey === currentSynthKey()) {
      const progress = getPlaybackProgress();
      await startPlaybackFrom(progress >= 0.999 ? 0 : progress);
      return;
    }

    // Same audio already loaded — play from start (or current if scrubbed)
    if (state.pcm?.length && state.synthKey === currentSynthKey() && state.playStatus !== 'playing') {
      const progress = getPlaybackProgress();
      await startPlaybackFrom(progress >= 0.999 ? 0 : progress);
      return;
    }

    // Already playing same clip → restart from beginning
    if (state.playStatus === 'playing' && state.synthKey === currentSynthKey()) {
      await startPlaybackFrom(0);
      return;
    }

    const model = await synthesizeCurrentText();
    showStatus(`${model.label} 합성 완료, 재생 중...`);
    await startPlaybackFrom(0);
  } catch (err) {
    stopTransportAnimation();
    state.synthesizing = false;
    updateTransportButtons();
    setPhase('error');
    showError(err);
  }
}

// ── Save WAV ─────────────────────────────────────────────────────────────────
async function saveWav() {
  try {
    if (!state.lastResult?.audioBuffer?.length) {
      await synthesizeCurrentText();
    }
    const filePath = await bridge.selectWavPath();
    if (!filePath) { showStatus('WAV 저장이 취소되었습니다.'); return; }
    await bridge.exportWav({
      filePath,
      audioBuffer: state.lastResult.audioBuffer,
      sampleRate:  state.lastResult.sampleRate
    });
    showStatus(`WAV 파일을 저장했습니다: ${filePath}`);
  } catch (error) {
    setPhase('error');
    showError(error);
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────
copyError?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(errorDetails?.textContent || '');
});

const aboutDialog = document.getElementById('aboutDialog');
document.getElementById('aboutBtn')?.addEventListener('click', () => {
  if (aboutDialog) {
    if (aboutDialog.open) aboutDialog.close();
    aboutDialog.showModal();
  }
});

document.getElementById('refreshModels').addEventListener('click', refreshModels);
document.getElementById('saveAudioDefaults')?.addEventListener('click', saveAudioDefaults);

async function openFile() {
  const openFn = bridge.openTextFile ?? webOpenTextFile;
  const result = await openFn();
  if (result?.content != null && textInput) {
    textInput.value = result.content;
    const fileName = result.filePath ? result.filePath.replace(/.*[\\/]/, '') : '(파일)';
    showStatus(`파일 열림: ${fileName}`);
  }
}

document.getElementById('openFileBtn')?.addEventListener('click', async () => {
  try { await openFile(); } catch (err) { showError(err); }
});

document.getElementById('openFileBtnEditor')?.addEventListener('click', async () => {
  try { await openFile(); } catch (err) { showError(err); }
});

const downloadModelBtn = document.getElementById('downloadModel');
downloadModelBtn?.addEventListener('click', async () => {
  if (!window.ttsBridge) {
    showError('Electron 브리지가 연결되지 않았습니다.\n\n브라우저에서는 모델 다운로드를 지원하지 않습니다.\nElectron 앱으로 실행하세요: npm start');
    return;
  }
  const model = state.models.find((m) => m.id === modelSelect.value) || null;
  if (!model) { showStatus('다운로드할 모델이 없습니다.'); return; }
  if (downloadModelBtn) downloadModelBtn.disabled = true;
  try {
    setPhase('downloading');
    setDownloadPhase(true);
    updateDlPanel(0, '', null, null);
    showProgress(0);
    showStatus(`${model.label} 다운로드를 준비하는 중입니다...`);
    const result = await bridge.downloadAndPrepareModel(model.id);
    setDownloadPhase(false);
    if (result?.downloaded) {
      setPhase('done');
      showStatus(`${model.label} 다운로드 완료.`);
      setTimeout(() => setPhase('idle'), 2500);
    } else {
      showStatus(`${model.label}은 이미 설치되어 있습니다.`);
    }
    await refreshModels();
    await warmSelectedModel();
  } catch (error) {
    setPhase('error');
    setDownloadPhase(false);
    showProgress(0);
    showError(error);
  } finally {
    if (downloadModelBtn) downloadModelBtn.disabled = false;
  }
});

speakBtn?.addEventListener('click', speakText);
pauseBtn?.addEventListener('click', () => pausePlayback());
stopBtn?.addEventListener('click', () => stopPlayback());
document.getElementById('saveWav').addEventListener('click', saveWav);
updateTransportButtons();

languageSelect.addEventListener('change', () => {
  const model = getPreferredModelForLanguage(languageSelect.value);
  if (model) { modelSelect.value = model.id; updateStatusBarModel(model); }
  updateStatusBarLanguage();
  refreshVoiceList();
});

async function warmSelectedModel() {
  const model = state.models.find((m) => m.id === modelSelect?.value);
  if (!model?.downloaded || !bridge.warmModel) return;
  try {
    showStatus(`${model.label} 엔진 준비 중...`);
    await bridge.warmModel(model.id);
    showStatus(`${model.label} 준비 완료. 읽기를 누르세요.`);
  } catch (err) {
    console.warn('[TTS] warm 실패:', err?.message || err);
  }
}

modelSelect.addEventListener('change', () => {
  const model = state.models.find((m) => m.id === modelSelect.value);
  updateStatusBarModel(model || null);
  if (model && !model.downloaded) {
    const desc = model.description ? ` — ${model.description}` : '';
    showStatus(`${model.label}${desc} (미설치, 다운로드 버튼을 눌러 설치하세요)`);
  }
  refreshVoiceList();
  warmSelectedModel();
});

voiceSelect?.addEventListener('change', () => {
  const model = state.models.find((m) => m.id === modelSelect?.value);
  if (waveformVoiceLabel) {
    const label = voiceSelect.value
      ? `${model?.label || ''} · ${voiceSelect.selectedOptions?.[0]?.textContent || voiceSelect.value}`
      : (model?.label || '');
    waveformVoiceLabel.textContent = label.trim();
  }
});

// Waveform scrub / seek (drag the red playhead)
function onScrubPointerDown(e) {
  if (!state.pcm?.length && !state.lastResult?.audioBuffer?.length) return;
  if (!state.pcm?.length && state.lastResult?.audioBuffer) {
    preparePcm(state.lastResult.audioBuffer, state.lastResult.sampleRate);
  }
  state.wasPlayingBeforeScrub = state.playStatus === 'playing';
  state.scrubbing = true;
  waveformCanvas.classList.add('scrubbing');
  waveformCanvas.setPointerCapture?.(e.pointerId);
  seekToProgress(canvasProgressFromEvent(e));
  e.preventDefault();
}

function onScrubPointerMove(e) {
  if (!state.scrubbing) return;
  seekToProgress(canvasProgressFromEvent(e));
  e.preventDefault();
}

function onScrubPointerUp(e) {
  if (!state.scrubbing) return;
  const progress = canvasProgressFromEvent(e);
  state.scrubbing = false;
  waveformCanvas.classList.remove('scrubbing');
  try { waveformCanvas.releasePointerCapture?.(e.pointerId); } catch { /**/ }
  seekToProgress(progress, { resumeIfWasPlaying: state.wasPlayingBeforeScrub });
  state.wasPlayingBeforeScrub = false;
}

waveformCanvas?.addEventListener('pointerdown', onScrubPointerDown);
waveformCanvas?.addEventListener('pointermove', onScrubPointerMove);
waveformCanvas?.addEventListener('pointerup', onScrubPointerUp);
waveformCanvas?.addEventListener('pointercancel', onScrubPointerUp);

// ── Waveform context menu (right-click) ───────────────────────────────────────
const waveformBody = document.getElementById('waveformBody');
const waveformContextMenu = document.getElementById('waveformContextMenu');
let ctxSeekProgress = 0;

function hideWaveformContextMenu() {
  if (!waveformContextMenu || waveformContextMenu.hidden) return;
  waveformContextMenu.hidden = true;
}

function showWaveformContextMenu(clientX, clientY, progress) {
  if (!waveformContextMenu) return;
  ctxSeekProgress = progress;
  updateTransportButtons();
  waveformContextMenu.hidden = false;

  const pad = 8;
  const mw = waveformContextMenu.offsetWidth || 180;
  const mh = waveformContextMenu.offsetHeight || 220;
  let left = clientX;
  let top = clientY;
  if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
  if (top + mh > window.innerHeight - pad) top = window.innerHeight - mh - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  waveformContextMenu.style.left = `${left}px`;
  waveformContextMenu.style.top = `${top}px`;
}

function onWaveformContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (state.scrubbing) return;

  let progress = 0;
  if (waveformCanvas) {
    const rect = waveformCanvas.getBoundingClientRect();
    progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
  }
  showWaveformContextMenu(e.clientX, e.clientY, progress);
}

waveformBody?.addEventListener('contextmenu', onWaveformContextMenu);
waveformCanvas?.addEventListener('contextmenu', onWaveformContextMenu);

waveformContextMenu?.addEventListener('click', async (e) => {
  const item = e.target.closest('[data-action]');
  if (!item || item.disabled) return;
  const action = item.dataset.action;
  hideWaveformContextMenu();

  try {
    if (action === 'play') await speakText();
    else if (action === 'pause') pausePlayback();
    else if (action === 'stop') stopPlayback();
    else if (action === 'seek-here') {
      const wasPlaying = state.playStatus === 'playing';
      seekToProgress(ctxSeekProgress, { resumeIfWasPlaying: wasPlaying });
    }
    else if (action === 'seek-start') {
      const wasPlaying = state.playStatus === 'playing';
      seekToProgress(0, { resumeIfWasPlaying: wasPlaying });
    }
    else if (action === 'seek-end') {
      const wasPlaying = state.playStatus === 'playing';
      seekToProgress(0.999, { resumeIfWasPlaying: false });
      if (wasPlaying) pausePlayback();
      else {
        state.playStatus = 'paused';
        updateTransportButtons();
      }
    }
    else if (action === 'save-wav') await saveWav();
  } catch (err) {
    showError(err);
  }
});

document.addEventListener('pointerdown', (e) => {
  if (!waveformContextMenu || waveformContextMenu.hidden) return;
  if (waveformContextMenu.contains(e.target)) return;
  hideWaveformContextMenu();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideWaveformContextMenu();
});

window.addEventListener('blur', hideWaveformContextMenu);
window.addEventListener('resize', hideWaveformContextMenu);
window.addEventListener('scroll', hideWaveformContextMenu, true);

// ── Boot ─────────────────────────────────────────────────────────────────────
refreshModels();
updateTransportButtons();

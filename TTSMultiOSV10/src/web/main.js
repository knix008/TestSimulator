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
        id: 'ko-supertonic-int8', label: 'Supertonic 2 INT8', language: 'ko-KR',
        sizeHint: '~100 MB', runtime: 'sherpa-onnx',
        description: 'Supertonic 2 · INT8 · 한국어 · 31언어',
        preferredOnFirstRun: true
      },
      {
        id: 'ko-piper-kss', label: 'Piper KSS', language: 'ko-KR',
        sizeHint: '64 MB', runtime: 'piper-onnx',
        description: '경량 임베디드 최적 모델 (VITS 기반)',
        preferredOnFirstRun: false
      },
      {
        id: 'ko-mms-tts', label: 'MMS TTS', language: 'ko-KR',
        sizeHint: '~38 MB', runtime: 'transformers-js',
        description: 'Meta MMS · Transformers.js 호환'
      },
      {
        id: 'en-kokoro', label: 'Kokoro 82M', language: 'en-US',
        sizeHint: '~82 MB', runtime: 'onnx',
        description: '영어 고품질 TTS (ONNX)'
      }
    ];
  },
  async downloadAndPrepareModel() { return null; },
  async getCachedModels()         { return []; },
  async selectAudioPath()         { return null; },
  async selectWavPath()           { return null; },
  async selectMp3Path()           { return null; },
  async exportWav()               { return null; },
  async exportMp3()               { return null; },
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
  lastExport: null,
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
const statusBarMessage   = document.getElementById('statusBarMessage');
const statusBarLanguage  = document.getElementById('statusBarLanguage');
const statusBarModel     = document.getElementById('statusBarModel');
const statusBarCache     = document.getElementById('statusBarCache');
const statusBarFill      = document.getElementById('statusBarFill');
const statusDot          = document.getElementById('statusDot');
const dlInfoPill         = document.getElementById('dlInfoPill');
const dlPercent          = document.getElementById('dlPercent');
const dlSize             = document.getElementById('dlSize');
const voiceSelect        = document.getElementById('voiceSelect');
const volumeRange        = document.getElementById('volumeRange');
const speedRange         = document.getElementById('speedRange');
const pitchRange         = document.getElementById('pitchRange');
const volumeLabel        = document.getElementById('volumeLabel');
const speedLabel         = document.getElementById('speedLabel');
const pitchLabel         = document.getElementById('pitchLabel');
const noiseScaleRange    = document.getElementById('noiseScaleRange');
const noiseWRange        = document.getElementById('noiseWRange');
const normalizeCheck     = document.getElementById('normalizeCheck');
const normalizeLevelRange = document.getElementById('normalizeLevelRange');
const normalizeLevelRow  = document.getElementById('normalizeLevelRow');
const noiseScaleLabel    = document.getElementById('noiseScaleLabel');
const noiseWLabel        = document.getElementById('noiseWLabel');
const normalizeLevelLabel = document.getElementById('normalizeLevelLabel');
const waveformSection    = document.getElementById('waveformSection');
const waveformCanvas     = document.getElementById('waveformCanvas');
const waveformCurrent    = document.getElementById('waveformCurrent');
const waveformDuration   = document.getElementById('waveformDuration');
const waveformEmpty      = document.getElementById('waveformEmpty');
const waveformVoiceLabel = document.getElementById('waveformVoiceLabel');
const errorDialog        = document.getElementById('errorDialog');
const errorDetails       = document.getElementById('errorDetails');
const copyError          = document.getElementById('copyError');
const mp3BitrateSelect   = document.getElementById('mp3BitrateSelect');

const AUDIO_DEFAULTS_KEY = 'tts-audio-defaults';
const DEFAULT_AUDIO_SETTINGS = {
  volume: 100,
  speed: 100,
  pitch: 0,
};

const PCM_DEFAULTS_KEY = 'tts-pcm-defaults';
const DEFAULT_PCM_SETTINGS = {
  noiseScale: 67,   // slider value; actual = value / 100 = 0.67
  noiseW: 80,       // slider value; actual = value / 100 = 0.80
  normalize: true,
  normalizeLevel: 90, // slider value; actual = value / 100 = 0.90
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

// ── PCM settings ─────────────────────────────────────────────────────────────
function readCurrentPcmSettings() {
  return {
    noiseScale: clampNumber(noiseScaleRange?.value, 0, 200, DEFAULT_PCM_SETTINGS.noiseScale),
    noiseW:     clampNumber(noiseWRange?.value, 0, 200, DEFAULT_PCM_SETTINGS.noiseW),
    normalize:  normalizeCheck?.checked ?? true,
    normalizeLevel: clampNumber(normalizeLevelRange?.value, 10, 100, DEFAULT_PCM_SETTINGS.normalizeLevel),
  };
}

function syncPcmParamLabels() {
  if (noiseScaleLabel && noiseScaleRange)
    noiseScaleLabel.textContent = (Number(noiseScaleRange.value) / 100).toFixed(2);
  if (noiseWLabel && noiseWRange)
    noiseWLabel.textContent = (Number(noiseWRange.value) / 100).toFixed(2);
  if (normalizeLevelLabel && normalizeLevelRange)
    normalizeLevelLabel.textContent = (Number(normalizeLevelRange.value) / 100).toFixed(2);
  if (normalizeLevelRow)
    normalizeLevelRow.style.opacity = (normalizeCheck?.checked) ? '' : '0.35';
}

function applyPcmSettings(settings) {
  if (noiseScaleRange) noiseScaleRange.value = String(clampNumber(settings?.noiseScale, 0, 200, DEFAULT_PCM_SETTINGS.noiseScale));
  if (noiseWRange)     noiseWRange.value     = String(clampNumber(settings?.noiseW, 0, 200, DEFAULT_PCM_SETTINGS.noiseW));
  if (normalizeCheck)  normalizeCheck.checked = settings?.normalize !== false;
  if (normalizeLevelRange) normalizeLevelRange.value = String(clampNumber(settings?.normalizeLevel, 10, 100, DEFAULT_PCM_SETTINGS.normalizeLevel));
  syncPcmParamLabels();
}

function loadPcmDefaults() {
  try {
    const raw = localStorage.getItem(PCM_DEFAULTS_KEY);
    applyPcmSettings(raw ? JSON.parse(raw) : DEFAULT_PCM_SETTINGS);
  } catch {
    applyPcmSettings(DEFAULT_PCM_SETTINGS);
  }
}

function savePcmDefaults() {
  const settings = readCurrentPcmSettings();
  localStorage.setItem(PCM_DEFAULTS_KEY, JSON.stringify(settings));
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
loadPcmDefaults();

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
/** When false, ignore late `download` IPC events after invoke already finished. */
let downloadUiActive = false;

function setDownloadPhase(active) {
  if (dlInfoPill) dlInfoPill.hidden = !active;
}

function updateDlPanel(percent, _fileName, receivedMB, totalMB) {
  if (dlPercent) dlPercent.textContent = `${percent}%`;
  if (dlSize) {
    dlSize.textContent = totalMB
      ? `${receivedMB} / ${totalMB} MB`
      : receivedMB ? `${receivedMB} MB` : '';
  }
}

function markDownloadUiComplete(label, { freshlyDownloaded = true } = {}) {
  downloadUiActive = false;
  showProgress(100);
  updateDlPanel(100, '', null, null);
  setDownloadPhase(false);
  if (freshlyDownloaded) {
    setPhase('done');
    showStatus(`${label} 다운로드 완료`);
    setTimeout(() => {
      if (!downloadUiActive) setPhase('idle');
    }, 2500);
  } else {
    setPhase('idle');
    showStatus(`${label}이 이미 다운로드되어 있습니다.`);
  }
}

// ── Status helpers ───────────────────────────────────────────────────────────
function showStatus(message) {
  if (statusBarMessage) statusBarMessage.textContent = message;
}

function showProgress(percent = 0) {
  const v = Math.max(0, Math.min(100, Number(percent) || 0));
  if (statusBarFill) statusBarFill.style.width = `${v}%`;
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
      downloadUiActive = true;
      setPhase('downloading');
      setDownloadPhase(true);
      updateDlPanel(0, '', null, null);
      showProgress(0);
      showStatus(`${progress.model?.label || '모델'} 다운로드를 시작합니다.`);
      return;
    }

    if (progress.phase === 'download') {
      // Invoke reply can arrive before the last progress IPC — ignore stale updates.
      if (!downloadUiActive) return;

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
      markDownloadUiComplete(progress.model?.label || '모델', {
        freshlyDownloaded: !!progress.downloaded,
      });
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
  setDisabled('save-audio', !hasAudio || state.synthesizing);
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

function showConfirm(title, message, { okLabel = '확인' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirmDialog');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (okBtn) okBtn.textContent = okLabel;
    const onClose = () => {
      dialog.removeEventListener('close', onClose);
      resolve(dialog.returnValue === 'ok');
    };
    dialog.addEventListener('close', onClose);
    if (dialog.open) dialog.close();
    dialog.showModal();
  });
}

// ── Model list ───────────────────────────────────────────────────────────────
function getPreferredModelForLanguage(language) {
  if (!language) return null;
  return state.models.find((m) => m.language === language && m.preferredOnFirstRun && m.downloaded)
    || state.models.find((m) => m.language === language && m.downloaded)
    || state.models.find((m) => m.language === language && m.preferredOnFirstRun)
    || state.models.find((m) => m.language === language)
    || null;
}

/** Detect ko-KR vs en-US from Hangul vs Latin letter counts. Returns null if undecided. */
function detectSynthesisLanguage(text) {
  let hangul = 0;
  let latin = 0;
  for (const ch of String(text || '')) {
    const c = ch.codePointAt(0);
    if ((c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F)) {
      hangul += 1;
    } else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) {
      latin += 1;
    }
  }
  if (hangul === 0 && latin === 0) return null;
  return hangul >= latin ? 'ko-KR' : 'en-US';
}

/**
 * Update synthesis language from input text (or keep manual override).
 * Never switches the selected model.
 */
function applyLanguageFromText(text = textInput?.value, { quiet = false } = {}) {
  const detected = detectSynthesisLanguage(text);
  if (!detected || !languageSelect) return false;

  const languageChanged = languageSelect.value !== detected;
  if (!languageChanged) return false;

  languageSelect.value = detected;
  updateStatusBarLanguage();
  if (!quiet) {
    const langLabel = detected === 'ko-KR' ? '한국어' : 'English';
    showStatus(`입력 언어 감지: ${langLabel} (모델: ${modelSelect?.selectedOptions?.[0]?.textContent || '-'})`);
  }
  return true;
}

let languageDetectTimer = 0;
function scheduleLanguageFromText() {
  clearTimeout(languageDetectTimer);
  languageDetectTimer = setTimeout(() => applyLanguageFromText(), 250);
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
    updateDownloadButtonState();
    showProgress(0);
    showStatus(downloadedCount === 0
      ? `설치된 모델이 없습니다. 모델을 선택하고 다운로드 버튼을 누르세요. (${state.models.length}개 항목)`
      : `모델 ${state.models.length}개 중 ${downloadedCount}개가 설치되어 있습니다.`);
    await refreshVoiceList();
    // Background-preload current model so first Speak is snappy (esp. Kokoro)
    applyLanguageFromText(textInput?.value, { quiet: true });
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
  const lang = languageSelect?.value || '';
  // Speed/pitch are playback params — not part of synthesis key
  return `${modelId}|${voiceId}|${lang}|${text}`;
}

// ── Speak / synthesize ───────────────────────────────────────────────────────
async function synthesizeCurrentText() {
  const text = textInput?.value ?? '';
  if (!text.trim()) {
    throw new Error('읽을 텍스트를 입력하세요.');
  }

  // Hint language from text for the model; keep the currently selected model.
  applyLanguageFromText(text, { quiet: true });

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
    showStatus(`${model.label}이 설치되어 있지 않아 다운로드를 시작합니다...`);
    const installed = await downloadSelectedModel();
    if (!installed) {
      throw new Error(`${model.label} 다운로드에 실패했습니다.\n「↓ 다운로드」로 다시 시도하세요.`);
    }
    // Refresh local reference after install
    const refreshed = state.models.find((m) => m.id === modelId);
    if (!refreshed?.downloaded) {
      throw new Error(`${model.label} 설치 상태를 확인하지 못했습니다.\n새로고침 후 다시 시도하세요.`);
    }
  }

  stopPlayback();
  window.speechSynthesis?.cancel();

  state.synthesizing = true;
  updateTransportButtons();
  setPhase('speaking');
  const activeModel = state.models.find((m) => m.id === modelId) || model;
  showStatus(`${activeModel.label} 모델 합성 중...`);
  // Do not draw a fake waveform while waiting — only show real PCM.
  clearWaveform(`${activeModel.label} 합성 중…`);

  try {
    const pcm = readCurrentPcmSettings();
    const result = await bridge.speak({
      text,
      modelId,
      voiceId: voiceId || undefined,
      speed: rate,
      language: lang,
      noiseScale:     pcm.noiseScale / 100,
      noiseW:         pcm.noiseW / 100,
      normalize:      pcm.normalize,
      normalizeLevel: pcm.normalizeLevel / 100,
    });

    if (!result?.audioBuffer?.length) {
      throw new Error(`${activeModel.label} 합성 결과가 비어 있습니다.`);
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
      ? `${activeModel.label} · ${voiceSelect?.selectedOptions?.[0]?.textContent || voiceId}`
      : activeModel.label;
    if (waveformVoiceLabel) waveformVoiceLabel.textContent = voiceLabel;

    return activeModel;
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

function sanitizeFileNameSegment(input) {
  return String(input || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeTimestampLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function formatDateTimeLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function createExportBaseName() {
  const model = state.models.find((m) => m.id === modelSelect?.value);
  const label = sanitizeFileNameSegment(model?.label || model?.id || 'tts-output');
  return `${label}-${makeTimestampLocal()}`;
}

function inferFormatFromPath(filePath, fallback = 'wav') {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.mp3')) return 'mp3';
  if (lower.endsWith('.wav')) return 'wav';
  return fallback === 'mp3' ? 'mp3' : 'wav';
}

function readMp3BitrateKbps() {
  const value = Number(mp3BitrateSelect?.value ?? 128);
  if (!Number.isFinite(value)) return 128;
  return Math.max(32, Math.min(320, Math.round(value)));
}

async function saveAudio(preferredFormat = 'wav', options = {}) {
  const reuseLastPath = !!options.reuseLastPath;
  const usedQuickSavePath = reuseLastPath && !!state.lastExport?.filePath;
  const saveTime = formatDateTimeLocal();
  try {
    if (!state.lastResult?.audioBuffer?.length) {
      await synthesizeCurrentText();
    }

    let selected = null;
    if (reuseLastPath && state.lastExport?.filePath) {
      selected = {
        filePath: state.lastExport.filePath,
        format: state.lastExport.format || inferFormatFromPath(state.lastExport.filePath, preferredFormat),
      };
    } else if (bridge.selectAudioPath) {
      selected = await bridge.selectAudioPath({
        format: preferredFormat,
        baseName: createExportBaseName(),
      });
    } else {
      const legacyPath = preferredFormat === 'mp3'
        ? await bridge.selectMp3Path()
        : await bridge.selectWavPath();
      selected = legacyPath ? { filePath: legacyPath, format: preferredFormat } : null;
    }

    if (!selected?.filePath) {
      showStatus(`${preferredFormat.toUpperCase()} 저장이 취소되었습니다.`);
      return;
    }

    const format = selected.format || inferFormatFromPath(selected.filePath, preferredFormat);
    if (format === 'mp3') {
      const bitrateKbps = readMp3BitrateKbps();
      await bridge.exportMp3({
        filePath: selected.filePath,
        audioBuffer: state.lastResult.audioBuffer,
        sampleRate: state.lastResult.sampleRate,
        bitrateKbps,
      });
      state.lastExport = { filePath: selected.filePath, format: 'mp3', bitrateKbps };
      showStatus(
        usedQuickSavePath
          ? `빠른 저장 완료 [${saveTime}] (MP3): ${selected.filePath} (${bitrateKbps} kbps)`
          : `MP3 파일을 저장했습니다: ${selected.filePath} (${bitrateKbps} kbps)`
      );
    } else {
      await bridge.exportWav({
        filePath: selected.filePath,
        audioBuffer: state.lastResult.audioBuffer,
        sampleRate: state.lastResult.sampleRate,
      });
      state.lastExport = { filePath: selected.filePath, format: 'wav' };
      showStatus(
        usedQuickSavePath
          ? `빠른 저장 완료 [${saveTime}] (WAV): ${selected.filePath}`
          : `WAV 파일을 저장했습니다: ${selected.filePath}`
      );
    }
  } catch (error) {
    setPhase('error');
    showError(error);
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────
function copyViaDomSelection(text) {
  const value = String(text ?? '');
  // Prefer selecting the visible error <pre> so modal focus stays valid.
  if (errorDetails && (errorDetails.textContent || '').trim()) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(errorDetails);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const ok = document.execCommand('copy');
    selection?.removeAllRanges();
    if (ok) return true;
  }

  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
  const host = errorDialog || document.body;
  host.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand('copy');
  ta.remove();
  return !!ok;
}

async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  const api = window.ttsBridge?.copyText || bridge.copyText;
  if (typeof api === 'function') {
    await api(value);
    return true;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to DOM selection copy.
  }
  if (copyViaDomSelection(value)) return true;
  throw new Error('클립보드 복사에 실패했습니다.');
}

function getErrorDialogCopyText() {
  const details = (errorDetails?.innerText || errorDetails?.textContent || '').trim();
  return details ? `오류\n\n${details}` : '오류';
}

copyError?.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const label = copyError.querySelector('span:last-child');
  const prev = label?.textContent || '복사';
  try {
    await copyTextToClipboard(getErrorDialogCopyText());
    if (label) label.textContent = '복사됨';
    copyError.disabled = true;
    setTimeout(() => {
      if (label) label.textContent = prev;
      copyError.disabled = false;
    }, 1200);
  } catch (err) {
    if (label) label.textContent = '실패';
    setTimeout(() => {
      if (label) label.textContent = prev;
    }, 1200);
    console.warn('[UI] 오류 복사 실패:', err?.message || err);
  }
});

const aboutDialog = document.getElementById('aboutDialog');
document.getElementById('aboutBtn')?.addEventListener('click', () => {
  if (aboutDialog) {
    if (aboutDialog.open) aboutDialog.close();
    aboutDialog.showModal();
  }
});

document.getElementById('refreshModels').addEventListener('click', refreshModels);
document.getElementById('saveAudioDefaults')?.addEventListener('click', () => {
  applyAudioSettings(DEFAULT_AUDIO_SETTINGS);
  showStatus('볼륨, 속도, 피치를 기본값으로 초기화했습니다.');
});

noiseScaleRange?.addEventListener('input', () => {
  if (noiseScaleLabel) noiseScaleLabel.textContent = (Number(noiseScaleRange.value) / 100).toFixed(2);
  savePcmDefaults();
});
noiseWRange?.addEventListener('input', () => {
  if (noiseWLabel) noiseWLabel.textContent = (Number(noiseWRange.value) / 100).toFixed(2);
  savePcmDefaults();
});
normalizeCheck?.addEventListener('change', () => {
  syncPcmParamLabels();
  savePcmDefaults();
});
normalizeLevelRange?.addEventListener('input', () => {
  if (normalizeLevelLabel) normalizeLevelLabel.textContent = (Number(normalizeLevelRange.value) / 100).toFixed(2);
  savePcmDefaults();
});
document.getElementById('pcmDefaultsBtn')?.addEventListener('click', () => {
  applyPcmSettings(DEFAULT_PCM_SETTINGS);
  savePcmDefaults();
  showStatus('변동성, 리듬, 정규화를 기본값으로 초기화했습니다.');
});

async function openFile() {
  const openFn = bridge.openTextFile ?? webOpenTextFile;
  const result = await openFn();
  if (result?.content != null && textInput) {
    textInput.value = result.content;
    applyLanguageFromText(result.content, { quiet: true });
    const fileName = result.filePath ? result.filePath.replace(/.*[\\/]/, '') : '(파일)';
    showStatus(`파일 열림: ${fileName}`);
  }
}

document.getElementById('openFileBtnEditor')?.addEventListener('click', async () => {
  try { await openFile(); } catch (err) { showError(err); }
});

const downloadModelBtn = document.getElementById('downloadModel');
const deleteModelBtn   = document.getElementById('deleteModel');

/** Sync download/delete button states with the selected model. */
function updateDownloadButtonState({ downloading = false, deleting = false } = {}) {
  if (!downloadModelBtn) return;
  const model = state.models.find((m) => m.id === modelSelect?.value) || null;
  const installed = !!model?.downloaded;
  const busy = downloading || deleting;

  downloadModelBtn.disabled = busy || installed || !model;
  downloadModelBtn.title = downloading
    ? '다운로드 중...'
    : installed
      ? '이미 설치된 모델입니다'
      : '선택한 모델 다운로드';
  downloadModelBtn.setAttribute('aria-disabled', downloadModelBtn.disabled ? 'true' : 'false');

  if (deleteModelBtn) {
    deleteModelBtn.disabled = busy || !installed || !bridge.deleteModel;
    deleteModelBtn.title = deleting
      ? '삭제 중...'
      : installed
        ? `${model?.label || '모델'} 삭제`
        : '미설치 모델입니다';
  }
}

/** Download the currently selected model. Returns true when cache is ready. */
async function downloadSelectedModel() {
  if (!window.ttsBridge) {
    throw new Error(
      'Electron 브리지가 연결되지 않았습니다.\n\n'
      + '브라우저에서는 모델 다운로드를 지원하지 않습니다.\n'
      + 'Electron 앱으로 실행하세요: npm start',
    );
  }
  const model = state.models.find((m) => m.id === modelSelect.value) || null;
  if (!model) {
    showStatus('다운로드할 모델이 없습니다.');
    return false;
  }
  if (model.downloaded) {
    showStatus(`${model.label}은 이미 설치되어 있습니다.`);
    updateDownloadButtonState();
    return true;
  }
  updateDownloadButtonState({ downloading: true });
  try {
    downloadUiActive = true;
    setPhase('downloading');
    setDownloadPhase(true);
    updateDlPanel(0, '', null, null);
    showProgress(0);
    showStatus(`${model.label} 다운로드를 준비하는 중입니다...`);
    const result = await bridge.downloadAndPrepareModel(model.id);
    // Invoke can resolve before the last progress IPC; force a consistent 100% UI.
    markDownloadUiComplete(model.label, { freshlyDownloaded: !!result?.downloaded });
    await refreshModels();
    await warmSelectedModel();
    const refreshed = state.models.find((m) => m.id === model.id);
    return !!refreshed?.downloaded;
  } catch (error) {
    downloadUiActive = false;
    setPhase('error');
    setDownloadPhase(false);
    showProgress(0);
    throw error;
  } finally {
    updateDownloadButtonState();
  }
}

downloadModelBtn?.addEventListener('click', async () => {
  try {
    await downloadSelectedModel();
  } catch (error) {
    showError(error);
  }
});

deleteModelBtn?.addEventListener('click', async () => {
  const model = state.models.find((m) => m.id === modelSelect?.value);
  if (!model?.downloaded) return;
  const confirmed = await showConfirm(
    '모델 삭제',
    `"${model.label}" 모델을 삭제하시겠습니까?\n다시 사용하려면 다운로드가 필요합니다.`,
    { okLabel: '삭제' },
  );
  if (!confirmed) return;
  updateDownloadButtonState({ deleting: true });
  try {
    await bridge.deleteModel(model.id);
    showStatus(`${model.label} 모델이 삭제되었습니다.`);
    await refreshModels();
  } catch (error) {
    showError(error);
  } finally {
    updateDownloadButtonState();
  }
});

speakBtn?.addEventListener('click', speakText);
pauseBtn?.addEventListener('click', () => pausePlayback());
stopBtn?.addEventListener('click', () => stopPlayback());
document.getElementById('saveAudio')?.addEventListener('click', () => saveAudio('wav'));
updateTransportButtons();

languageSelect.addEventListener('change', () => {
  // Manual override — do not switch models.
  updateStatusBarLanguage();
  showStatus(`합성 언어: ${languageSelect.value === 'ko-KR' ? '한국어' : 'English'}`);
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
  // Keep synthesis language independent of model (text/manual selection decides).
  updateStatusBarModel(model || null);
  updateDownloadButtonState();
  if (model && !model.downloaded) {
    const desc = model.description ? ` — ${model.description}` : '';
    showStatus(`${model.label}${desc} (미설치, 다운로드 버튼을 눌러 설치하세요)`);
  }
  refreshVoiceList();
  warmSelectedModel();
});

textInput?.addEventListener('input', scheduleLanguageFromText);
textInput?.addEventListener('paste', () => {
  setTimeout(scheduleLanguageFromText, 0);
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

// Waveform scrub / seek — left button only (right button opens context menu)
function onScrubPointerDown(e) {
  // Mouse: primary (left) only. Touch/pen still use button 0.
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (!state.pcm?.length && !state.lastResult?.audioBuffer?.length) return;
  if (!state.pcm?.length && state.lastResult?.audioBuffer) {
    preparePcm(state.lastResult.audioBuffer, state.lastResult.sampleRate);
  }
  hideWaveformContextMenu();
  state.wasPlayingBeforeScrub = state.playStatus === 'playing';
  state.scrubbing = true;
  waveformCanvas.classList.add('scrubbing');
  waveformCanvas.setPointerCapture?.(e.pointerId);
  seekToProgress(canvasProgressFromEvent(e));
  e.preventDefault();
}

function onScrubPointerMove(e) {
  if (!state.scrubbing) return;
  // Ignore non-primary mouse moves while another button is held.
  if (e.pointerType === 'mouse' && e.buttons !== 0 && (e.buttons & 1) === 0) return;
  seekToProgress(canvasProgressFromEvent(e));
  e.preventDefault();
}

function onScrubPointerUp(e) {
  if (!state.scrubbing) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
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
  // Cancel accidental scrub if a previous left-drag was interrupted.
  if (state.scrubbing) {
    state.scrubbing = false;
    waveformCanvas?.classList.remove('scrubbing');
    state.wasPlayingBeforeScrub = false;
  }

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
    else if (action === 'save-audio') await saveAudio('wav');
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
  const isSaveShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 's';
  if (isSaveShortcut) {
    e.preventDefault();
    hideWaveformContextMenu();
    const isSaveAs = !!e.shiftKey;
    void saveAudio('wav', { reuseLastPath: !isSaveAs });
    return;
  }
  if (e.key === 'Escape') hideWaveformContextMenu();
});

window.addEventListener('blur', hideWaveformContextMenu);
window.addEventListener('resize', hideWaveformContextMenu);
window.addEventListener('scroll', hideWaveformContextMenu, true);

// ── Boot ─────────────────────────────────────────────────────────────────────
refreshModels();
updateTransportButtons();

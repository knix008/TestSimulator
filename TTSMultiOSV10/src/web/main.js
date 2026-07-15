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
        preferredOnFirstRun: true
      },
      {
        id: 'ko-supertonic-int8', label: 'Supertonic INT8', language: 'ko-KR',
        sizeHint: '~200 MB', runtime: 'sherpa-onnx',
        description: 'INT8 양자화 · 한국어+영어 · sherpa-onnx 호환'
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
  waveformImageData: null,
  rafId: null
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
const errorDialog        = document.getElementById('errorDialog');
const errorDetails       = document.getElementById('errorDetails');
const copyError          = document.getElementById('copyError');

// ── Theme ────────────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('tts-theme', theme);
}

function cycleTheme() {
  applyTheme(localStorage.getItem('tts-theme') === 'light' ? 'dark' : 'light');
}

applyTheme(localStorage.getItem('tts-theme') || 'dark');
themeToggle?.addEventListener('click', cycleTheme);

// ── Speech-like waveform generator ───────────────────────────────────────────
// Uses additive synthesis with randomized micro-variation to mimic real speech.
function generateSpeechLikeWaveform(text, sampleRate, speed = 1.0) {
  const hasKorean  = /[가-힣]/.test(text);
  const secPerChar = (hasKorean ? 0.11 : 0.075) / Math.max(0.1, speed);

  // Build segments with character span info for onboundary mapping
  const segs = [];
  let charCursor = 0;
  const tokens = text.split(/(\s+|[.!?,。、]+)/);

  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      segs.push({ voiced: false, dur: 0.06 / speed, charStart: charCursor, charLen: tok.length });
    } else if (/^[.!?。]+$/.test(tok)) {
      segs.push({ voiced: false, dur: 0.26 / speed, charStart: charCursor, charLen: tok.length });
    } else if (/^[,、]+$/.test(tok)) {
      segs.push({ voiced: false, dur: 0.13 / speed, charStart: charCursor, charLen: tok.length });
    } else {
      segs.push({ voiced: true, dur: Math.max(0.06, tok.length * secPerChar), charStart: charCursor, charLen: tok.length });
    }
    charCursor += tok.length;
  }

  const totalDur      = Math.max(1.0, segs.reduce((s, e) => s + e.dur, 0));
  const len           = Math.round(sampleRate * totalDur);
  const out           = new Float32Array(len);
  const charSampleMap = new Int32Array(text.length + 1);

  // Seeded pseudo-random for repeatable-but-varied waveform
  let rngState = 0x9e3779b9;
  function rng() {
    rngState ^= rngState << 13; rngState ^= rngState >> 17; rngState ^= rngState << 5;
    return (rngState >>> 0) / 0xffffffff;
  }

  let pos = 0;
  let t   = 0;

  for (const seg of segs) {
    const segLen = Math.round(sampleRate * seg.dur);

    for (let c = 0; c < seg.charLen; c++) {
      const ci = seg.charStart + c;
      if (ci < charSampleMap.length) {
        charSampleMap[ci] = pos + Math.round((c / Math.max(1, seg.charLen)) * segLen);
      }
    }

    if (seg.voiced) {
      // Per-syllable parameters for natural variation
      const f0Base   = 140 + rng() * 80;            // Fundamental: 140–220 Hz
      const jitter   = 0.004 + rng() * 0.006;       // Pitch jitter (micro-variation)
      const shimmer  = 0.04  + rng() * 0.08;        // Amplitude shimmer
      const breathAmp = 0.04 + rng() * 0.06;        // Breathiness noise level

      for (let i = 0; i < segLen && pos + i < len; i++) {
        const loc = i / segLen;

        // Natural amplitude envelope (attack/sustain/release)
        const attack  = Math.min(1, loc * 12);
        const release = Math.min(1, (1 - loc) * 10);
        const env     = attack * release;

        // Pitch with jitter and prosodic arc (rises then falls)
        const prosody = 1 + 0.12 * Math.sin(Math.PI * loc);
        const f0      = f0Base * prosody * (1 + jitter * (rng() - 0.5));

        // Glottal source: harmonics with falling spectral tilt
        const h1 = Math.sin(2 * Math.PI * f0 * t);
        const h2 = Math.sin(2 * Math.PI * f0 * 2 * t) * 0.55;
        const h3 = Math.sin(2 * Math.PI * f0 * 3 * t) * 0.28;
        const h4 = Math.sin(2 * Math.PI * f0 * 4 * t) * 0.14;
        const h5 = Math.sin(2 * Math.PI * f0 * 5 * t) * 0.07;
        const h6 = Math.sin(2 * Math.PI * f0 * 6 * t) * 0.03;

        // Formant-like resonance modulation (approximates vowel coloring)
        const fmtMod = 1 + 0.18 * Math.sin(2 * Math.PI * 800 * t + rng() * 0.01);

        // Breathiness (band-limited noise approximation using fast rng)
        const noise = (rng() - 0.5) * 2;

        const glottal  = (h1 + h2 + h3 + h4 + h5 + h6) * fmtMod;
        const amShim   = 1 + shimmer * (rng() - 0.5);
        out[pos + i]   = (glottal * amShim + noise * breathAmp) * env * 0.52;

        t += 1 / sampleRate;
      }
    } else {
      t += seg.dur;
    }
    pos += segLen;
    if (pos >= len) break;
  }
  charSampleMap[text.length] = len;
  return { samples: out, charSampleMap };
}

// ── Waveform accent colors (resolve CSS vars per theme) ──────────────────────
function getWaveformColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (document.documentElement.getAttribute('data-theme') !== 'light'
        && !window.matchMedia('(prefers-color-scheme: light)').matches);
  return isDark
    ? { fill: '#5ed7c0', strong: '#7ac7ff', played: 'rgba(94, 215, 192, 0.15)', cursor: '#ff3b3b' }
    : { fill: '#147d72', strong: '#3464ff', played: 'rgba(20, 125, 114, 0.12)',  cursor: '#e01010' };
}

// ── DOM refs (waveform empty state) ──────────────────────────────────────────
const waveformEmpty = document.getElementById('waveformEmpty');
const waveformVoiceLabel = document.getElementById('waveformVoiceLabel');

// ── Waveform draw ────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function drawWaveform(samples, sampleRate) {
  if (!waveformCanvas || !samples?.length) return;

  if (waveformEmpty) waveformEmpty.classList.add('hidden');

  // Use actual rect if non-zero, otherwise measure after one frame
  const dpr  = window.devicePixelRatio || 1;
  const rect = waveformCanvas.getBoundingClientRect();
  const W    = Math.floor(rect.width  * dpr) || Math.floor(waveformCanvas.offsetWidth  * dpr) || 1100;
  const H    = Math.floor(rect.height * dpr) || Math.floor(waveformCanvas.offsetHeight * dpr) || 88;

  waveformCanvas.width  = W;
  waveformCanvas.height = H;

  const ctx = waveformCanvas.getContext('2d');
  const w   = W / dpr;
  const h   = H / dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const mid    = h / 2;
  const step   = samples.length / w;
  const colors = getWaveformColors();

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, colors.fill);
  grad.addColorStop(1, colors.strong);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 1.5;

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
    ctx.moveTo(x, mid + min * mid * 0.88);
    ctx.lineTo(x, mid + max * mid * 0.88);
  }
  ctx.stroke();

  // Save for animation overlay
  state.waveformImageData = ctx.getImageData(0, 0, W, H);

  if (waveformDuration) waveformDuration.textContent = formatTime(samples.length / sampleRate);
  if (waveformCurrent)  waveformCurrent.textContent  = '0:00';
}

function drawPlayheadAt(progress) {
  if (!waveformCanvas || !state.waveformImageData) return;
  const ctx = waveformCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = waveformCanvas.width;
  const H = waveformCanvas.height;
  const w = W / dpr;
  const h = H / dpr;

  ctx.putImageData(state.waveformImageData, 0, 0);

  const x = progress * w;
  const colors = getWaveformColors();

  // Played region tint
  ctx.fillStyle = colors.played;
  ctx.fillRect(0, 0, x, h);

  // Playhead line
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.strokeStyle = colors.cursor;
  ctx.lineWidth   = 2;
  ctx.stroke();
}

function startWaveformAnimation(audioCtx, startTime, duration) {
  if (state.rafId) cancelAnimationFrame(state.rafId);

  function tick() {
    const elapsed  = audioCtx.currentTime - startTime;
    const progress = Math.min(1, elapsed / duration);
    drawPlayheadAt(progress);
    if (waveformCurrent) waveformCurrent.textContent = formatTime(Math.min(elapsed, duration));
    if (progress < 1 && state.currentSource) {
      state.rafId = requestAnimationFrame(tick);
    } else {
      state.rafId = null;
      drawPlayheadAt(1);
      if (waveformCurrent) waveformCurrent.textContent = formatTime(duration);
    }
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

// ── Audio playback with controls ─────────────────────────────────────────────
async function playAudioBuffer(samples, sampleRate) {
  const context = getAudioContext();
  if (!context) throw new Error('Audio playback is not supported in this environment.');

  if (state.currentSource) {
    try { state.currentSource.stop(); } catch { /* stopped already */ }
    state.currentSource.disconnect();
    state.currentSource = null;
  }

  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }

  const data = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  if (!data.length) throw new Error('No audio samples were generated.');

  if (context.state === 'suspended') await context.resume();

  // Read controls
  const volume    = Number(volumeRange?.value ?? 100) / 100;
  const speedPct  = Number(speedRange?.value  ?? 100);
  const pitchSemi = Number(pitchRange?.value  ?? 0);

  // Pitch via effective sample-rate (changes pitch without changing playback duration at cost of ~equal tempo shift)
  const pitchFactor   = Math.pow(2, pitchSemi / 12);
  const effSampleRate = Math.round(sampleRate * pitchFactor);
  const speedFactor   = speedPct / 100;

  const buffer = context.createBuffer(1, data.length, effSampleRate);
  buffer.copyToChannel(data, 0);

  const source = context.createBufferSource();
  source.buffer       = buffer;
  source.playbackRate.value = speedFactor;

  const gain = context.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(context.destination);

  state.currentSource = source;
  source.start();

  const startTime = context.currentTime;
  // Actual audible duration = buffer samples / effSampleRate / speedFactor
  const duration = data.length / effSampleRate / speedFactor;

  // Draw waveform (original pitch samples for visual accuracy)
  drawWaveform(data, sampleRate);
  startWaveformAnimation(context, startTime, duration);

  await new Promise((resolve) => { source.onended = resolve; });
  if (state.currentSource === source) state.currentSource = null;
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

// ── Voice param slider wiring ────────────────────────────────────────────────
volumeRange?.addEventListener('input', () => {
  if (volumeLabel) volumeLabel.textContent = `${volumeRange.value}%`;
});

speedRange?.addEventListener('input', () => {
  if (speedLabel) speedLabel.textContent = `${(Number(speedRange.value) / 100).toFixed(2)}×`;
});

pitchRange?.addEventListener('input', () => {
  const v = Number(pitchRange.value);
  if (pitchLabel) pitchLabel.textContent = v === 0 ? '±0' : (v > 0 ? `+${v}` : `${v}`);
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
      modelSelect.value = available?.id
        || state.models.find((m) => m.language === languageSelect.value)?.id
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
  } catch (error) {
    setPhase('error');
    showError(error);
  }
}

// ── Speak ────────────────────────────────────────────────────────────────────
async function speakText() {
  try {
    const text = textInput?.value ?? '';
    if (!text.trim()) {
      showError('읽을 텍스트를 입력하세요.');
      return;
    }

    // Stop any in-progress playback
    if (state.currentSource) {
      try { state.currentSource.stop(); } catch { /**/ }
      state.currentSource = null;
    }
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    window.speechSynthesis?.cancel();

    setPhase('speaking');

    const lang    = languageSelect?.value ?? 'ko-KR';
    const rate    = Number(speedRange?.value ?? 100) / 100;
    const modelId = modelSelect?.value || '';
    const model   = state.models.find((m) => m.id === modelId);
    const voiceId = voiceSelect?.value || '';

    if (!window.ttsBridge) {
      throw new Error('모델 합성은 Electron 앱에서만 지원됩니다.\nnpm start 로 실행하세요.');
    }
    if (!model) {
      throw new Error('모델을 선택하세요.');
    }
    if (!model.downloaded) {
      throw new Error(`${model.label} 모델이 설치되어 있지 않습니다.\n다운로드 후 다시 시도하세요.`);
    }

    showStatus(`${model.label} 모델 합성 중...`);
    const { samples: placeholder } = generateSpeechLikeWaveform(text, 22050, rate);
    drawWaveform(placeholder, 22050);

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

    const audioF32 = Float32Array.from(result.audioBuffer);
    state.lastResult = {
      audioBuffer: result.audioBuffer,
      sampleRate: result.sampleRate,
      text,
    };

    const voiceLabel = voiceId
      ? `${model.label} · ${voiceSelect?.selectedOptions?.[0]?.textContent || voiceId}`
      : model.label;
    if (waveformVoiceLabel) waveformVoiceLabel.textContent = voiceLabel;

    showStatus(`${model.label} 합성 완료, 재생 중...`);
    await playAudioBuffer(audioF32, result.sampleRate);
    setPhase('done');
    showStatus('읽기 완료.');
    setTimeout(() => setPhase('idle'), 2500);
  } catch (err) {
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    setPhase('error');
    showError(err);
  }
}

// ── Save WAV ─────────────────────────────────────────────────────────────────
async function saveWav() {
  try {
    if (!state.lastResult) await speakText();
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

async function openFile() {
  const openFn = bridge.openTextFile ?? webOpenTextFile;
  const result = await openFn();
  if (result?.content != null && textInput) {
    textInput.value = result.content;
    showStatus(`파일 열림: ${result.filePath || '(파일)'}`);
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
  } catch (error) {
    setPhase('error');
    setDownloadPhase(false);
    showProgress(0);
    showError(error);
  } finally {
    if (downloadModelBtn) downloadModelBtn.disabled = false;
  }
});

document.getElementById('speakText').addEventListener('click', speakText);
document.getElementById('saveWav').addEventListener('click', saveWav);

languageSelect.addEventListener('change', () => {
  const model = state.models.find((m) => m.language === languageSelect.value);
  if (model) { modelSelect.value = model.id; updateStatusBarModel(model); }
  updateStatusBarLanguage();
  refreshVoiceList();
});

modelSelect.addEventListener('change', () => {
  const model = state.models.find((m) => m.id === modelSelect.value);
  updateStatusBarModel(model || null);
  if (model && !model.downloaded) {
    const desc = model.description ? ` — ${model.description}` : '';
    showStatus(`${model.label}${desc} (미설치, 다운로드 버튼을 눌러 설치하세요)`);
  }
  refreshVoiceList();
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

// Waveform click to seek (visual only — actual audio seek not supported by Web Audio)
waveformCanvas?.addEventListener('click', (e) => {
  if (!state.waveformImageData || !state.lastResult) return;
  const rect = waveformCanvas.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  drawPlayheadAt(progress);
  if (waveformCurrent && state.lastResult.audioBuffer) {
    const duration = (state.lastResult.audioBuffer.length || 0) / state.lastResult.sampleRate;
    waveformCurrent.textContent = formatTime(progress * duration);
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────────
refreshModels();

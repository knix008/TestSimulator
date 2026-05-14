const $ = (id) => document.getElementById(id);

const textEl = $("text");
const readalongWrap = $("readalongWrap");
const readalongOverlay = $("readalongOverlay");
const readalongOverlayInner = $("readalongOverlayInner");
const fileEl = $("file");
const voiceEl = $("voice");
const rateEl = $("rate");
const pitchEl = $("pitch");
const volumeEl = $("volume");
const rateVal = $("rateVal");
const pitchVal = $("pitchVal");
const volumeVal = $("volumeVal");
const statusEl = $("status");
const audioEl = $("player");
const playPauseBtn = $("playPause");
const timeEl = $("time");
const waveCanvas = $("wave");
const saveFormatEl = $("saveFormat");
const saveAudioBtn = $("saveAudio");

const ctx = waveCanvas.getContext("2d");

const WAVE_MAJOR_DIVISIONS = 5;

let lastAudioBlob = null;
let lastFilenameBase = "tts";
let lastAudioBuffer = null;
/** 마지막으로 합성에 사용된 문자열(읽기 진행 기준 길이) */
let lastSynthText = "";
/** 마지막 합성 시 텍스트·옵션 지문(재합성 필요 여부) */
let lastSynthFingerprint = "";
let peaks = null;
let rafId = 0;
/** `updateTextPlayhead`가 마지막으로 계산한 문자 인덱스(스크롤 시 오버레이 재배치용) */
let lastReadalongDisplayIdx = 0;

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateSliderLabels() {
  rateVal.textContent = `${rateEl.value}%`;
  pitchVal.textContent = String(pitchEl.value);
  volumeVal.textContent = `${volumeEl.value}%`;
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

async function loadVoices() {
  const res = await fetch("/api/voices");
  const data = await res.json();
  voiceEl.innerHTML = "";

  if (!res.ok || data.ok === false) {
    const err = data.error || "음성 엔진을 초기화하지 못했습니다. 모델 폴더를 확인하세요.";
    setStatus(err);
    return;
  }

  const voices = data.voices || [];
  const sorted = [...voices].sort((a, b) =>
    `${a.Locale} ${a.FriendlyName}`.localeCompare(`${b.Locale} ${b.FriendlyName}`),
  );
  for (const v of sorted) {
    const opt = document.createElement("option");
    opt.value = v.ShortName;
    opt.textContent = `${v.Locale} — ${v.FriendlyName}`;
    voiceEl.appendChild(opt);
  }
  if (voiceEl.options.length) {
    const prefer = "0";
    const match = [...voiceEl.options].find((o) => o.value === prefer);
    voiceEl.value = match ? prefer : voiceEl.options[0].value;
  }
}

function computePeaks(audioBuffer, width) {
  const ch0 = audioBuffer.getChannelData(0);
  const len = ch0.length;
  const block = Math.max(1, Math.floor(len / width));
  const outMin = new Float32Array(width);
  const outMax = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const start = x * block;
    const end = Math.min(len, start + block);
    let vmin = 0;
    let vmax = 0;
    for (let i = start; i < end; i++) {
      const s = ch0[i];
      if (s < vmin) vmin = s;
      if (s > vmax) vmax = s;
    }
    outMin[x] = vmin;
    outMax[x] = vmax;
  }
  return { outMin, outMax };
}

function getWaveDuration() {
  const d = audioEl.duration;
  if (Number.isFinite(d) && d > 0) return d;
  if (lastAudioBuffer && Number.isFinite(lastAudioBuffer.duration) && lastAudioBuffer.duration > 0) {
    return lastAudioBuffer.duration;
  }
  return 0;
}

/** 재생 위치와 맞출 기준 글자 수(마지막 합성 문장 길이 우선) */
function readAlignBaseLength() {
  if (lastSynthText) return Math.max(1, lastSynthText.length);
  const live = textEl.value.length;
  return Math.max(1, live);
}

function currentSynthFingerprint(t) {
  return JSON.stringify({
    t,
    voice: voiceEl.value,
    rate: rateEl.value,
    pitch: pitchEl.value,
    vol: volumeEl.value,
  });
}

function needsResynth() {
  const t = textEl.value.trim();
  if (!t) return true;
  if (!lastAudioBuffer || !audioEl.src) return true;
  return currentSynthFingerprint(t) !== lastSynthFingerprint;
}

/** 읽는 위치가 보이도록 textarea 스크롤 */
function scrollTextareaToIndex(idx, len) {
  const el = textEl;
  const v = el.value;
  const n = len > 0 ? len : v.length;
  if (!n) return;
  const i = Math.max(0, Math.min(idx, v.length));
  const scrollMax = Math.max(0, el.scrollHeight - el.clientHeight);
  if (scrollMax <= 0) return;
  const ratio = i / n;
  const target = ratio * el.scrollHeight - el.clientHeight * 0.38;
  readalongProgrammaticScroll = true;
  el.scrollTop = Math.max(0, Math.min(scrollMax, target));
  queueMicrotask(() => {
    readalongProgrammaticScroll = false;
  });
}

const READALONG_LAYOUT_PROPS = [
  "direction",
  "boxSizing",
  "overflow",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontFamily",
  "lineHeight",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "whiteSpace",
  "wordWrap",
  "overflowWrap",
  "wordBreak",
  "tabSize",
];

function copyTextareaLayoutToMirror(from, to) {
  const cs = getComputedStyle(from);
  for (const p of READALONG_LAYOUT_PROPS) {
    to.style[p] = cs[p];
  }
  to.style.whiteSpace = "pre-wrap";
  to.style.wordWrap = "break-word";
  to.style.overflowWrap = "break-word";
  to.style.width = "100%";
  to.style.boxSizing = "border-box";
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let readalongCacheReadEnd = -1;
let readalongCacheScroll = -2;
/** `scrollTextareaToIndex` 등 코드에서 스크롤할 때(사용자 스크롤과 구분) */
let readalongProgrammaticScroll = false;

function invalidateReadalongOverlay() {
  readalongCacheReadEnd = -1;
  readalongCacheScroll = -2;
}

function hideReadalongOverlay() {
  readalongOverlay.classList.remove("is-visible");
  readalongOverlayInner.innerHTML = "";
}

/**
 * textarea는 부분 색상을 줄 수 없어, 동일 타이포·줄바꿈 오버레이에
 * 읽은 구간(현재 글자까지)만 흰 배경·검정 글자로 그린다.
 */
function syncReadalongOverlay(idx) {
  const playing = !audioEl.paused && !audioEl.ended && Boolean(audioEl.src);
  if (!playing || !textEl.value.length) {
    hideReadalongOverlay();
    return;
  }

  const v = textEl.value;
  const len = v.length;
  const pos = Math.max(0, Math.min(idx, len));
  const readEnd = Math.min(pos + 1, len);

  if (readEnd === readalongCacheReadEnd && textEl.scrollTop === readalongCacheScroll) {
    readalongOverlay.classList.add("is-visible");
    return;
  }
  readalongCacheReadEnd = readEnd;
  readalongCacheScroll = textEl.scrollTop;

  readalongOverlay.style.left = `${textEl.clientLeft}px`;
  readalongOverlay.style.top = `${textEl.clientTop}px`;
  readalongOverlay.style.width = `${textEl.clientWidth}px`;
  readalongOverlay.style.height = `${textEl.clientHeight}px`;

  copyTextareaLayoutToMirror(textEl, readalongOverlayInner);
  readalongOverlayInner.style.overflow = "visible";
  readalongOverlayInner.style.overflowX = "visible";
  readalongOverlayInner.style.overflowY = "visible";
  readalongOverlayInner.style.position = "relative";
  readalongOverlayInner.style.top = `${-textEl.scrollTop}px`;
  readalongOverlayInner.style.left = "0";
  readalongOverlayInner.style.minHeight = `${textEl.scrollHeight}px`;

  const readPart = v.slice(0, readEnd);
  const tailPart = v.slice(readEnd);
  readalongOverlayInner.innerHTML = `<span class="readalong-read">${escapeHtml(readPart)}</span><span class="readalong-tail">${escapeHtml(tailPart)}</span>`;

  void readalongOverlay.offsetHeight;
  readalongOverlay.classList.add("is-visible");
}

/** 재생 진행에 맞춰 선택·스크롤·읽기 강조(오버레이). 재생 중에는 입력란이 읽기 전용입니다. */
function updateTextPlayhead() {
  const live = textEl.value;
  const safeSel = (a, b) => {
    try {
      textEl.setSelectionRange(a, b);
    } catch {
      /* ignore */
    }
  };

  if (!live || !audioEl.src) {
    lastReadalongDisplayIdx = 0;
    readalongWrap.classList.remove("readalong-wrap--playing");
    invalidateReadalongOverlay();
    hideReadalongOverlay();
    if (document.activeElement !== textEl) safeSel(0, 0);
    return;
  }

  const dur = getWaveDuration();
  if (!dur) {
    readalongWrap.classList.remove("readalong-wrap--playing");
    invalidateReadalongOverlay();
    hideReadalongOverlay();
    if (document.activeElement !== textEl) safeSel(0, 0);
    return;
  }

  const baseLen = readAlignBaseLength();
  const p = Math.max(0, Math.min(1, audioEl.currentTime / dur));
  const ideal = Math.floor(p * baseLen);
  const idx = Math.min(live.length, ideal);
  lastReadalongDisplayIdx = idx;

  const playing = !audioEl.paused && !audioEl.ended;
  const editing = document.activeElement === textEl && !textEl.readOnly;

  if (!playing) {
    invalidateReadalongOverlay();
    hideReadalongOverlay();
    if (editing) return;
    const atEnd = audioEl.ended || audioEl.currentTime >= dur - 0.03;
    if (atEnd) {
      safeSel(live.length, live.length);
      scrollTextareaToIndex(live.length, baseLen);
    } else {
      safeSel(idx, idx);
      scrollTextareaToIndex(idx, baseLen);
    }
    return;
  }

  safeSel(idx, idx);
  scrollTextareaToIndex(idx, baseLen);
  syncReadalongOverlay(idx);
}

function waveLayout(canvasHeight, dpr) {
  const rulerH = Math.min(
    Math.max(Math.round(38 * dpr), Math.floor(canvasHeight * 0.26)),
    Math.floor(canvasHeight * 0.36),
  );
  const waveH = canvasHeight - rulerH;
  return { waveH: Math.max(2, waveH), rulerH };
}

/**
 * @param {CanvasRenderingContext2D} c
 */
function drawTimeRuler(c, w, h, waveH, durationSec, dpr) {
  const top = waveH;
  const rulerH = h - waveH;
  const tickTop = top + Math.round(4 * dpr);
  const majorH = Math.round(9 * dpr);
  const minorH = Math.round(5 * dpr);
  const baseline = tickTop + majorH;
  const fontPx = Math.max(10, Math.round(11 * dpr));
  const pad = Math.round(6 * dpr);

  c.fillStyle = "#070910";
  c.fillRect(0, top, w, rulerH);

  c.strokeStyle = "#2a3548";
  c.lineWidth = Math.max(1, dpr);
  c.beginPath();
  c.moveTo(0, top + 0.5);
  c.lineTo(w, top + 0.5);
  c.stroke();

  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;

  c.font = `600 ${fontPx}px system-ui, "Segoe UI", "Noto Sans KR", sans-serif`;
  c.textBaseline = "top";

  for (let i = 0; i <= WAVE_MAJOR_DIVISIONS; i++) {
    const x = (i / WAVE_MAJOR_DIVISIONS) * (w - 1);
    c.strokeStyle = "#6a7a94";
    c.lineWidth = Math.max(1, 1.1 * dpr);
    c.beginPath();
    c.moveTo(x + 0.5, tickTop);
    c.lineTo(x + 0.5, baseline);
    c.stroke();

    const t = dur > 0 ? (i / WAVE_MAJOR_DIVISIONS) * dur : 0;
    const label = dur > 0 ? fmtTime(t) : i === 0 ? "0:00" : "";
    if (!label) continue;
    c.fillStyle = "#97a3b8";
    if (i === 0) {
      c.textAlign = "left";
      c.fillText(label, pad, baseline + Math.round(3 * dpr));
    } else if (i === WAVE_MAJOR_DIVISIONS) {
      c.textAlign = "right";
      c.fillText(label, w - pad, baseline + Math.round(3 * dpr));
    } else {
      c.textAlign = "center";
      c.fillText(label, x, baseline + Math.round(3 * dpr));
    }
  }

  if (w > 180 * dpr) {
    c.strokeStyle = "#3d4a5c";
    c.lineWidth = Math.max(0.8, 0.85 * dpr);
    for (let i = 0; i < WAVE_MAJOR_DIVISIONS; i++) {
      for (let j = 1; j < 5; j++) {
        const frac = (i + j / 5) / WAVE_MAJOR_DIVISIONS;
        const x = frac * (w - 1);
        c.beginPath();
        c.moveTo(x + 0.5, baseline - minorH);
        c.lineTo(x + 0.5, baseline);
        c.stroke();
      }
    }
  }
}

function drawWaveform(progress01, durationSec) {
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const { waveH } = waveLayout(h, dpr);
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const p = Math.max(0, Math.min(1, progress01));

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(0, 0, w, waveH);

  if (peaks) {
    const mid = waveH / 2;
    const amp = mid * 0.9;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= WAVE_MAJOR_DIVISIONS; i++) {
      const gx = (i / WAVE_MAJOR_DIVISIONS) * (w - 1);
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 0);
      ctx.lineTo(gx + 0.5, waveH);
      ctx.stroke();
    }

    ctx.strokeStyle = "#3d4a63";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    ctx.strokeStyle = "#7ea3ff";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x++) {
      const ymin = peaks.outMin[x] * amp;
      const ymax = peaks.outMax[x] * amp;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, mid + ymin);
      ctx.lineTo(x + 0.5, mid + ymax);
      ctx.stroke();
    }
  }

  drawTimeRuler(ctx, w, h, waveH, dur, dpr);

  const xPlay = p * (w - 1);
  ctx.save();
  ctx.shadowColor = "rgba(220, 64, 64, 0.55)";
  ctx.shadowBlur = 8 * dpr;
  ctx.strokeStyle = "#e23d3d";
  ctx.lineWidth = Math.max(3.5, 3 * dpr);
  ctx.beginPath();
  ctx.moveTo(xPlay, 0);
  ctx.lineTo(xPlay, waveH);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 220, 220, 0.9)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xPlay, 0);
  ctx.lineTo(xPlay, Math.min(Math.round(12 * dpr), waveH));
  ctx.stroke();
}

function resizeCanvasToDisplaySize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = waveCanvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width * dpr));
  const h = Math.max(80, Math.floor((rect.height || 200) * dpr));
  if (waveCanvas.width !== w || waveCanvas.height !== h) {
    waveCanvas.width = w;
    waveCanvas.height = h;
    return true;
  }
  return false;
}

function redrawFromAudio() {
  resizeCanvasToDisplaySize();
  if (!lastAudioBuffer) {
    peaks = null;
    drawWaveform(0, 0);
    updateTextPlayhead();
    return;
  }
  peaks = computePeaks(lastAudioBuffer, waveCanvas.width);
  const cur = audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
  drawWaveform(cur, getWaveDuration());
  updateTextPlayhead();
}

function tick() {
  const d = audioEl.duration;
  const cur = audioEl.currentTime;
  timeEl.textContent = `${fmtTime(cur)} / ${fmtTime(d || 0)}`;
  const p = d ? cur / d : 0;
  drawWaveform(p, getWaveDuration());
  updateTextPlayhead();
  rafId = requestAnimationFrame(tick);
}

function startRaf() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

function stopRaf() {
  cancelAnimationFrame(rafId);
}

function triggerDownload(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function synthesizeFromText(text) {
  setStatus("합성 중…");
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: voiceEl.value,
        ratePercent: Number(rateEl.value),
        pitchHz: Number(pitchEl.value),
        volumePercent: Number(volumeEl.value),
      }),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      const err = ct.includes("json") ? (await res.json()).error : await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    await applyAudioBlob(blob);
    lastSynthText = text;
    lastSynthFingerprint = currentSynthFingerprint(text);
    setStatus("");
  } catch (e) {
    setStatus(String(e.message || e));
    throw e;
  }
}

async function applyAudioBlob(blob) {
  lastAudioBlob = blob;
  const ac = new AudioContext();
  const buf = await blob.arrayBuffer();
  lastAudioBuffer = await ac.decodeAudioData(buf.slice(0));
  await ac.close();

  if (audioEl.src) URL.revokeObjectURL(audioEl.src);
  audioEl.src = URL.createObjectURL(blob);
  audioEl.load();

  saveFormatEl.disabled = false;
  saveAudioBtn.disabled = false;
  playPauseBtn.textContent = "재생";

  redrawFromAudio();
  updateTextPlayhead();
}

fileEl.addEventListener("change", async () => {
  const f = fileEl.files?.[0];
  if (!f) return;
  const t = await f.text();
  textEl.value = t;
  lastSynthText = "";
  lastSynthFingerprint = "";
  lastFilenameBase = f.name.replace(/\.[^/.]+$/, "") || "tts";
  setStatus(`파일 로드: ${f.name}`);
});

playPauseBtn.addEventListener("click", async () => {
  if (!audioEl.paused) {
    audioEl.pause();
    return;
  }

  const t = textEl.value.trim();
  if (!t) {
    setStatus("문장을 입력한 뒤 재생을 누르세요.");
    return;
  }

  const f = fileEl.files?.[0];
  lastFilenameBase = f ? f.name.replace(/\.[^/.]+$/, "") || "tts" : "tts";

  playPauseBtn.disabled = true;
  textEl.readOnly = true;
  try {
    if (needsResynth()) {
      await synthesizeFromText(t);
    }
    await audioEl.play();
  } catch (e) {
    textEl.readOnly = false;
    readalongWrap.classList.remove("readalong-wrap--playing");
    hideReadalongOverlay();
    const msg = String(e?.message || e);
    if (!msg.includes("AbortError")) setStatus(msg);
  } finally {
    playPauseBtn.disabled = false;
  }
});

rateEl.addEventListener("input", updateSliderLabels);
pitchEl.addEventListener("input", updateSliderLabels);
volumeEl.addEventListener("input", updateSliderLabels);

audioEl.addEventListener("loadedmetadata", () => {
  redrawFromAudio();
  updateTextPlayhead();
});
audioEl.addEventListener("timeupdate", () => {
  updateTextPlayhead();
});
audioEl.addEventListener("play", () => {
  playPauseBtn.textContent = "일시정지";
  readalongWrap.classList.add("readalong-wrap--playing");
  invalidateReadalongOverlay();
  startRaf();
});
audioEl.addEventListener("pause", () => {
  playPauseBtn.textContent = "재생";
  textEl.readOnly = false;
  readalongWrap.classList.remove("readalong-wrap--playing");
  invalidateReadalongOverlay();
  hideReadalongOverlay();
  stopRaf();
  redrawFromAudio();
});
audioEl.addEventListener("ended", () => {
  playPauseBtn.textContent = "재생";
  textEl.readOnly = false;
  readalongWrap.classList.remove("readalong-wrap--playing");
  invalidateReadalongOverlay();
  hideReadalongOverlay();
  stopRaf();
  redrawFromAudio();
});

waveCanvas.addEventListener("click", (ev) => {
  const dur = getWaveDuration();
  if (!dur || !Number.isFinite(dur)) return;
  const rect = waveCanvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const p = x / rect.width;
  audioEl.currentTime = Math.max(0, Math.min(dur, p * dur));
  redrawFromAudio();
});

saveAudioBtn.addEventListener("click", async () => {
  if (!lastAudioBlob) return;
  const fmt = saveFormatEl.value;
  if (fmt === "wav") {
    triggerDownload(lastAudioBlob, `${lastFilenameBase}.wav`);
    return;
  }
  setStatus("MP3 인코딩…");
  saveAudioBtn.disabled = true;
  saveFormatEl.disabled = true;
  try {
    const buf = await lastAudioBlob.arrayBuffer();
    const res = await fetch("/api/wav-to-mp3", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: buf,
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      const err = ct.includes("json") ? (await res.json()).error : await res.text();
      throw new Error(err || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    triggerDownload(blob, `${lastFilenameBase}.mp3`);
    setStatus("");
  } catch (e) {
    setStatus(String(e.message || e));
  } finally {
    saveAudioBtn.disabled = false;
    saveFormatEl.disabled = false;
  }
});

window.addEventListener("resize", () => {
  invalidateReadalongOverlay();
  if (lastAudioBuffer) redrawFromAudio();
});

textEl.addEventListener("scroll", () => {
  if (readalongProgrammaticScroll) return;
  invalidateReadalongOverlay();
  if (!audioEl.paused && !audioEl.ended && audioEl.src) {
    syncReadalongOverlay(lastReadalongDisplayIdx);
  }
});

if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(() => {
    invalidateReadalongOverlay();
    if (!audioEl.paused && !audioEl.ended && audioEl.src) {
      syncReadalongOverlay(lastReadalongDisplayIdx);
    }
  });
  ro.observe(textEl);
}

updateSliderLabels();

resizeCanvasToDisplaySize();
drawWaveform(0, 0);
updateTextPlayhead();

loadVoices().catch((e) => setStatus(String(e.message || e)));

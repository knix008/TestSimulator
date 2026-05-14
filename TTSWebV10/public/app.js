const $ = (id) => document.getElementById(id);

const textEl = $("text");
const fileEl = $("file");
const voiceEl = $("voice");
const rateEl = $("rate");
const pitchEl = $("pitch");
const volumeEl = $("volume");
const rateVal = $("rateVal");
const pitchVal = $("pitchVal");
const volumeVal = $("volumeVal");
const synthBtn = $("synthesize");
const statusEl = $("status");
const audioEl = $("player");
const playPauseBtn = $("playPause");
const timeEl = $("time");
const waveCanvas = $("wave");
const dlWav = $("dlWav");

const ctx = waveCanvas.getContext("2d");

let lastAudioBlob = null;
let lastFilenameBase = "tts";
let lastAudioBuffer = null;
let peaks = null;
let rafId = 0;

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

function drawWaveform(progress01) {
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(0, 0, w, h);
  if (!peaks) return;

  const mid = h / 2;
  const amp = mid * 0.92;
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

  const p = Math.max(0, Math.min(1, progress01));
  const x = p * (w - 1);
  ctx.strokeStyle = "#c94c4c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
}

function resizeCanvasToDisplaySize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = waveCanvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width * dpr));
  const h = Math.floor(160 * dpr);
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
    drawWaveform(0);
    return;
  }
  peaks = computePeaks(lastAudioBuffer, waveCanvas.width);
  const cur = audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
  drawWaveform(cur);
}

function tick() {
  const d = audioEl.duration;
  const cur = audioEl.currentTime;
  timeEl.textContent = `${fmtTime(cur)} / ${fmtTime(d || 0)}`;
  const p = d ? cur / d : 0;
  drawWaveform(p);
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
  synthBtn.disabled = true;
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
    setStatus("완료");
  } catch (e) {
    setStatus(String(e.message || e));
    throw e;
  } finally {
    synthBtn.disabled = false;
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

  dlWav.disabled = false;
  playPauseBtn.textContent = "재생";

  redrawFromAudio();
}

fileEl.addEventListener("change", async () => {
  const f = fileEl.files?.[0];
  if (!f) return;
  const t = await f.text();
  textEl.value = t;
  lastFilenameBase = f.name.replace(/\.[^/.]+$/, "") || "tts";
  setStatus(`파일 로드: ${f.name}`);
});

synthBtn.addEventListener("click", async () => {
  const text = textEl.value.trim();
  if (!text) {
    setStatus("텍스트를 입력하거나 파일을 선택하세요.");
    return;
  }
  const f = fileEl.files?.[0];
  lastFilenameBase = f ? f.name.replace(/\.[^/.]+$/, "") || "tts" : "tts";
  await synthesizeFromText(text);
});

rateEl.addEventListener("input", updateSliderLabels);
pitchEl.addEventListener("input", updateSliderLabels);
volumeEl.addEventListener("input", updateSliderLabels);

audioEl.addEventListener("play", () => {
  playPauseBtn.textContent = "일시정지";
  startRaf();
});
audioEl.addEventListener("pause", () => {
  playPauseBtn.textContent = "재생";
  stopRaf();
  redrawFromAudio();
});
audioEl.addEventListener("ended", () => {
  playPauseBtn.textContent = "재생";
  stopRaf();
  redrawFromAudio();
});

playPauseBtn.addEventListener("click", () => {
  if (!audioEl.src) return;
  if (audioEl.paused) void audioEl.play();
  else audioEl.pause();
});

waveCanvas.addEventListener("click", (ev) => {
  if (!audioEl.duration || !Number.isFinite(audioEl.duration)) return;
  const rect = waveCanvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const p = x / rect.width;
  audioEl.currentTime = Math.max(0, Math.min(audioEl.duration, p * audioEl.duration));
  redrawFromAudio();
});

dlWav.addEventListener("click", () => {
  if (!lastAudioBlob) return;
  triggerDownload(lastAudioBlob, `${lastFilenameBase}.wav`);
});

window.addEventListener("resize", () => {
  if (lastAudioBuffer) redrawFromAudio();
});

updateSliderLabels();

resizeCanvasToDisplaySize();
drawWaveform(0);

loadVoices().catch((e) => setStatus(String(e.message || e)));

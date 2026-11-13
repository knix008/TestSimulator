// "화자별 결과": below the waveform, one row per speaker of a multi-speaker model, each with
// the text synthesized in that voice — a small waveform, its length, play and save. main.js
// runs the synthesis (synthesizeAllVoices) and owns the audio; this module only draws.
//
// speakers = { modelLabel, text, items: [{ id, label, status: 'wait'|'busy'|'done'|'error'|'skip',
//              result?: { audioBuffer, sampleRate }, error? }] }
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const STATUS = { wait: '대기', busy: '생성 중…', error: '실패', skip: '건너뜀' };

let panel = null;
let handlers = {};

export function initSpeakerPanel(element, given) {
  panel = element;
  handlers = given;
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-speaker-action]');
    if (!button || button.disabled) return;
    const index = Number(button.dataset.index);
    const action = button.dataset.speakerAction;
    if (action === 'play') handlers.onPlay?.(index);
    else if (action === 'save') handlers.onSave?.(index);
    else if (action === 'stop') handlers.onStop?.();
    else if (action === 'close') handlers.onClose?.();
  });
  // Rows are drawn once their canvas has a size (the panel may have been hidden).
  new ResizeObserver(() => drawAll()).observe(panel);
}

let shown = null;
let activeIndex = -1;

/** Shows `speakers` (null hides the panel); `active` is the row whose audio is in the main waveform. */
export function renderSpeakers(speakers, { active = -1, running = false } = {}) {
  if (!panel) return;
  shown = speakers;
  activeIndex = active;
  panel.hidden = !speakers;
  if (!speakers) return;
  const done = speakers.items.filter((item) => item.status === 'done').length;
  const total = speakers.items.length;
  panel.querySelector('.speaker-summary').textContent = running
    ? `${speakers.modelLabel} · ${done}/${total} 생성 중`
    : `${speakers.modelLabel} · 화자 ${total}명 중 ${done}명 생성`;
  panel.querySelector('[data-speaker-action="stop"]').hidden = !running;
  const list = panel.querySelector('.speaker-list');
  list.innerHTML = speakers.items.map((item, index) => {
    const ok = item.status === 'done' && item.result;
    const seconds = ok ? item.result.audioBuffer.length / item.result.sampleRate : 0;
    return `<div class="speaker-row ${index === active ? 'active' : ''} ${item.status}" data-index="${index}">
      <button type="button" class="icon-button speaker-play" data-speaker-action="play" data-index="${index}" ${ok && !running ? '' : 'disabled'} title="${escapeHtml(item.label)} 듣기 (파형에 올려 재생)" aria-label="${escapeHtml(item.label)} 듣기">${icon('play')}</button>
      <span class="speaker-name" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
      <span class="speaker-wave">${ok ? `<canvas data-wave="${index}"></canvas>` : `<span class="speaker-status">${escapeHtml(item.status === 'error' ? `실패: ${item.error || ''}` : STATUS[item.status] || '')}</span>`}</span>
      <span class="speaker-time">${ok ? formatTime(seconds) : ''}</span>
      <button type="button" class="icon-button" data-speaker-action="save" data-index="${index}" ${ok && !running ? '' : 'disabled'} title="${escapeHtml(item.label)} 음성 저장" aria-label="${escapeHtml(item.label)} 음성 저장">${icon('save')}</button>
    </div>`;
  }).join('');
  drawAll();
}

function drawAll() {
  if (!shown || panel.hidden) return;
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#3a6cf0';
  const muted = styles.getPropertyValue('--muted').trim() || '#888';
  for (const canvas of panel.querySelectorAll('canvas[data-wave]')) {
    const index = Number(canvas.dataset.wave);
    const samples = shown.items[index]?.result?.audioBuffer;
    if (!samples?.length) continue;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (!canvas.clientWidth) continue;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = index === activeIndex ? accent : muted;
    ctx.lineWidth = Math.max(1, dpr * 0.9);
    ctx.beginPath();
    const step = samples.length / w;
    const mid = h / 2;
    for (let x = 0; x < w; x += 1) {
      const start = Math.floor(x * step);
      const end = Math.min(samples.length, start + Math.max(1, Math.ceil(step)));
      let min = 0;
      let max = 0;
      for (let i = start; i < end; i += 1) {
        const v = samples[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, mid + min * mid * 0.95);
      ctx.lineTo(x + 0.5, mid + max * mid * 0.95 + 0.5);
    }
    ctx.stroke();
  }
}

/** Theme changes redraw in the new colours. */
export const redrawSpeakers = () => drawAll();

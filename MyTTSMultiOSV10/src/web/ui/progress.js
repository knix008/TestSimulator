// The progress popup: "읽기" (one synthesis — the engine reports no progress, so the bar moves
// on its own), "모든 화자" (one step per speaker) and model downloads (percent, file, MB).
// It shows the model and the current item, the start of the text, a bar, the elapsed time and
// a stop / cancel / hide button, and closes by itself. Short jobs never flash it: it appears
// after `delay` ms.
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * Opens the popup. options: { kind ('speak' | 'speakers' | 'download'), title, model, item, text,
 * total (steps, 0 = unknown), countText(done, total), cancelLabel, onCancel, hideOnly (the button
 * only hides the popup; the work goes on), delay }. Returns { update({ done, item, note }), close() }.
 */
export function showGenerationProgress({ kind = 'speak', title = '음성 생성 중', model = '', item = '', text = '', total = 0, countText = null, cancelLabel = '취소', onCancel = null, hideOnly = false, delay = 300 } = {}) {
  let dialog = document.getElementById('progressDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'progressDialog';
    dialog.className = 'app-dialog narrow progress-dialog';
    document.body.appendChild(dialog);
    // Esc would close the dialog without stopping the work: treat it as the button.
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); dialog.querySelector('[data-progress-cancel]')?.click(); });
  }
  const started = Date.now();
  const state = { done: 0, item, note: '', cancelled: false, closed: false };
  const preview = String(text).replace(/\s+/g, ' ').trim();
  dialog.dataset.kind = kind;
  const glyph = { speak: 'ttsSpeak', speakers: 'ttsVoice', download: 'ttsDownload' }[kind] || 'ttsSpeak';
  dialog.innerHTML = `<div class="popup">
    <header class="popup-head"><h2>${icon(glyph)}<span>${escapeHtml(title)}</span></h2></header>
    <div class="popup-body progress-view">
      <div class="progress-line"><span class="progress-model">${icon('ttsModel')}<b>${escapeHtml(model)}</b></span><span class="progress-item" data-progress-item></span></div>
      ${preview ? `<div class="progress-text" title="${escapeHtml(preview)}">“${escapeHtml(preview.length > 90 ? `${preview.slice(0, 90)}…` : preview)}”</div>` : ''}
      <div class="progress-bar ${total ? '' : 'indeterminate'}" role="progressbar" aria-valuemin="0" aria-valuemax="${total || 100}" data-progress-bar><i></i></div>
      <div class="progress-line muted"><span data-progress-count></span><span class="grow"></span>${icon('clock')}<span data-progress-time>0:00</span></div>
      <div class="progress-note" data-progress-note></div>
    </div>
    <footer class="popup-foot"><span class="grow"></span>${onCancel || hideOnly ? `<button type="button" class="button" data-progress-cancel>${icon(hideOnly ? 'eye' : 'stop')}<span>${escapeHtml(cancelLabel)}</span></button>` : ''}</footer>
  </div>`;
  const $ = (selector) => dialog.querySelector(selector);
  const paint = () => {
    $('[data-progress-item]').textContent = state.item ? `· ${state.item}` : '';
    $('[data-progress-time]').textContent = clock(Date.now() - started);
    $('[data-progress-note]').textContent = state.note;
    if (total) {
      const pct = Math.max(0, Math.min(100, Math.round((state.done / total) * 100)));
      $('[data-progress-bar] i').style.width = `${pct}%`;
      $('[data-progress-bar]').setAttribute('aria-valuenow', String(state.done));
      $('[data-progress-count]').textContent = countText ? countText(state.done, total, pct) : `${state.done} / ${total} 화자 · ${pct}%`;
    } else {
      $('[data-progress-count]').textContent = '합성 중…';
    }
  };
  $('[data-progress-cancel]')?.addEventListener('click', () => {
    if (hideOnly) { state.closed = true; clearTimeout(opener); if (dialog.open) dialog.close(); onCancel?.(); return; }
    if (state.cancelled) return;
    state.cancelled = true;
    state.note = total ? '멈추는 중… (지금 화자가 끝나면 멈춥니다)' : '취소하는 중… (합성이 끝나면 결과를 버립니다)';
    const button = $('[data-progress-cancel]');
    if (button) button.disabled = true;
    paint();
    onCancel?.();
  });
  paint();
  const ticker = setInterval(paint, 250);
  let opener = 0;
  opener = setTimeout(() => { if (!state.closed && !dialog.open) dialog.showModal(); }, delay);
  return {
    get cancelled() { return state.cancelled; },
    get closed() { return state.closed; },
    update({ done = state.done, item: next = state.item, note = state.note } = {}) {
      Object.assign(state, { done, item: next, note });
      paint();
    },
    close() {
      state.closed = true;
      clearTimeout(opener);
      clearInterval(ticker);
      if (dialog.open) dialog.close();
    },
  };
}

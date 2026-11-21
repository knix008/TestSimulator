// Every slider of every window (input type="range") gets the same frame: a "−" button on the left, the
// slider, the current value as an editable box with its unit, and a "+" button on the right. The buttons
// step the slider; typing a value (within min … max) moves it. Each change fires the slider's own 'input'
// and 'change' events, so the code that listens to the slider does not need to know about the frame.
// The unit comes from the slider's data-unit attribute. An <output> right after the slider is hidden.

const decimalsOf = (step) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(4, s.length - i - 1); };

function format(range) {
  const v = Number(range.value);
  const step = Number(range.step) || 1;
  const d = range.step === 'any' ? 2 : decimalsOf(step);
  return Number.isFinite(v) ? v.toFixed(d) : '';
}

/** Shows a slider's value in its box (for code that sets `slider.value` itself). */
export function syncSlider(range) {
  const box = range?.closest('.slider-control')?.querySelector('.slider-value');
  if (box && document.activeElement !== box) box.value = format(range);
}

function fire(range) {
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
}

function setValue(range, v) {
  const min = Number(range.min || 0); const max = Number(range.max || 100);
  const clamped = Math.max(min, Math.min(max, v));
  range.value = String(clamped);
  syncSlider(range);
  fire(range);
}

function enhance(range) {
  if (range.dataset.sliderFramed) return;
  range.dataset.sliderFramed = '1';
  const doc = range.ownerDocument;
  const wrap = doc.createElement('span');
  wrap.className = 'slider-control';
  const minus = doc.createElement('button');
  minus.type = 'button'; minus.className = 'slider-step'; minus.textContent = '−'; minus.setAttribute('aria-label', '−');
  const plus = doc.createElement('button');
  plus.type = 'button'; plus.className = 'slider-step'; plus.textContent = '+'; plus.setAttribute('aria-label', '+');
  const box = doc.createElement('input');
  box.type = 'text'; box.className = 'slider-value'; box.spellcheck = false; box.inputMode = 'decimal';
  box.setAttribute('aria-label', range.getAttribute('aria-label') ?? range.closest('label')?.textContent?.trim() ?? '');
  const unit = doc.createElement('span');
  unit.className = 'slider-unit';
  unit.textContent = range.dataset.unit ?? '';
  const valueGroup = doc.createElement('span');
  valueGroup.className = 'slider-readout';
  valueGroup.append(box, unit);
  range.replaceWith(wrap);
  wrap.append(minus, range, valueGroup, plus);
  // The page's own read-out is replaced by the editable box.
  const next = wrap.nextElementSibling;
  if (next?.tagName === 'OUTPUT') next.hidden = true;
  syncSlider(range);
  const stepBy = (dir) => {
    const step = range.step === 'any' ? (Number(range.max) - Number(range.min)) / 100 : Number(range.step) || 1;
    setValue(range, Number(range.value) + dir * step);
  };
  minus.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stepBy(-1); });
  plus.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stepBy(1); });
  // A held button keeps stepping.
  for (const [btn, dir] of [[minus, -1], [plus, 1]]) {
    let timer = 0;
    btn.addEventListener('pointerdown', () => { clearInterval(timer); timer = setTimeout(() => { timer = setInterval(() => stepBy(dir), 70); }, 400); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => { clearTimeout(timer); clearInterval(timer); });
  }
  range.addEventListener('input', () => syncSlider(range));
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); box.blur(); }
    if (e.key === 'Escape') { box.value = format(range); box.blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepBy(e.key === 'ArrowUp' ? 1 : -1); }
    e.stopPropagation();
  });
  box.addEventListener('change', (e) => {
    e.stopPropagation();
    const v = Number(String(box.value).replace(',', '.').replace(/[^0-9.eE+\-]/g, ''));
    if (Number.isFinite(v)) setValue(range, v); else box.value = format(range);
  });
  box.addEventListener('blur', () => { box.value = format(range); });
}

/**
 * A typed number (input[data-num]): "−" · value · unit · "+". The buttons add / take away data-num-step (1 by
 * default; 0.1 below 10 for decimals) and fire 'change' like typing does, so the page's own handler runs.
 */
function frameNumber(input) {
  if (input.dataset.numFramed) return;
  input.dataset.numFramed = '1';
  const doc = input.ownerDocument;
  const wrap = doc.createElement('span');
  wrap.className = 'num-control';
  const btn = (text, dir) => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'slider-step'; b.textContent = text; b.setAttribute('aria-label', text); b.dataset.dir = String(dir); return b; };
  const minus = btn('−', -1); const plus = btn('+', 1);
  const unit = doc.createElement('span');
  unit.className = 'num-unit';
  unit.textContent = input.dataset.unitLabel ?? '';
  input.replaceWith(wrap);
  wrap.append(minus, input, unit, plus);
  const step = (dir) => {
    const v = Number(String(input.value).replace(',', '.').replace(/[^0-9.eE+\-]/g, ''));
    const base = Number.isFinite(v) ? v : 0;
    const size = Number(input.dataset.numStep) || (Math.abs(base) < 10 && !Number.isInteger(base) ? 0.1 : 1);
    const next = Math.round((base + dir * size) * 1e6) / 1e6;
    input.value = String(next);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  for (const b of [minus, plus]) {
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(Number(b.dataset.dir)); });
    let timer = 0;
    b.addEventListener('pointerdown', () => { clearInterval(timer); timer = setTimeout(() => { timer = setInterval(() => step(Number(b.dataset.dir)), 90); }, 450); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { clearTimeout(timer); clearInterval(timer); });
  }
}

/** Frames every slider in `doc`, now and whenever new ones appear. */
export function installSliders(doc = document) {
  const scan = (node) => {
    for (const r of node.querySelectorAll?.('input[type="range"]:not([data-slider-framed])') ?? []) enhance(r);
    for (const n of node.querySelectorAll?.('input[data-num]:not([data-num-framed])') ?? []) frameNumber(n);
  };
  scan(doc);
  const observer = new MutationObserver((records) => { for (const rec of records) for (const n of rec.addedNodes) if (n.nodeType === 1) { if (n.matches?.('input[type="range"]')) enhance(n); else if (n.matches?.('input[data-num]')) frameNumber(n); else scan(n); } });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  return observer;
}

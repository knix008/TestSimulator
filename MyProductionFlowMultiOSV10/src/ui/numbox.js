// Every number field of every window (main, popups, document viewer; installed from main.js):
//   [ − ]  value unit  [ + ]
// Each <input type="number"> gets a decrease button on its left and an increase button on its right, and its
// unit (data-unit, or the <i> unit of a .num-field) is shown next to the value. The buttons step the value by the
// input's step (or a step that fits the value when the step is "any"), keep within min/max, keep stepping while
// held, and fire the input's own `input` and `change` events, so every existing handler works unchanged.
// Inputs added later (every re-render) are wrapped too (MutationObserver).
import { icon } from '../icons.js';

/** The step a button moves `value` by: the input's step, or one unit of the value's last significant place. */
export function autoStep(value, step) {
  const s = Number(step);
  if (Number.isFinite(s) && s > 0) return s;
  const v = Math.abs(Number(value) || 0);
  if (v === 0) return 1;
  if (Number.isInteger(v) && v < 100) return 1;
  return 10 ** (Math.floor(Math.log10(v)) - 1);
}

/** value + dir × step, rounded to the step's decimals and kept within min…max. */
export function stepValue(value, dir, { step, min, max }) {
  const size = autoStep(value, step);
  const decimals = Math.max(0, -Math.floor(Math.log10(size) + 1e-9));
  let next = Number(((Number(value) || 0) + dir * size).toFixed(Math.min(10, decimals + 2)));
  next = Number(next.toFixed(Math.min(10, Math.max(decimals, decimalsOf(value)))));
  if (Number.isFinite(Number(min)) && min !== '' && min != null) next = Math.max(Number(min), next);
  if (Number.isFinite(Number(max)) && max !== '' && max != null) next = Math.min(Number(max), next);
  return next;
}
const decimalsOf = (v) => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

function wrap(input) {
  if (input.dataset.numbox || input.closest('.stepper')) return;
  input.dataset.numbox = '1';
  const doc = input.ownerDocument;
  // The unit: a .num-field already shows it in an <i>; a bare input names it in data-unit.
  let core = input.closest('.num-field');
  if (!core) {
    core = doc.createElement('span');
    core.className = 'num-field';
    input.replaceWith(core);
    core.append(input);
    const unit = input.dataset.unit;
    if (unit) { const i = doc.createElement('i'); i.textContent = unit; core.append(i); }
  }
  const box = doc.createElement('span');
  box.className = 'num-box';
  core.replaceWith(box);
  const button = (dir) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'num-step';
    b.dataset.numStep = String(dir);
    b.tabIndex = -1;
    b.innerHTML = icon(dir < 0 ? 'minus' : 'plus');
    b.disabled = input.disabled;
    return b;
  };
  box.append(button(-1), core, button(1));
}

function enhance(root) {
  if (root.matches?.('input[type="number"]')) wrap(root);
  for (const input of root.querySelectorAll?.('input[type="number"]:not([data-numbox])') ?? []) wrap(input);
}

export function installNumberBoxes(doc) {
  enhance(doc.body ?? doc);
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) enhance(n);
  }).observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  let repeat = null;
  const stop = () => { clearTimeout(repeat?.timeout); clearInterval(repeat?.interval); repeat = null; };
  const step = (btn) => {
    const input = btn.closest('.num-box')?.querySelector('input[type="number"]');
    if (!input || input.disabled || input.readOnly) return;
    input.value = String(stepValue(input.value, Number(btn.dataset.numStep), { step: input.step, min: input.min, max: input.max }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  doc.addEventListener('pointerdown', (event) => {
    const btn = event.target.closest?.('.num-step');
    if (!btn || btn.disabled || event.button !== 0) return;
    event.preventDefault();
    step(btn);
    stop();
    repeat = { timeout: setTimeout(() => { repeat.interval = setInterval(() => { if (btn.isConnected) step(btn); else stop(); }, 90); }, 450) };
  });
  for (const type of ['pointerup', 'pointercancel']) doc.addEventListener(type, stop, true);
  doc.addEventListener('pointerleave', stop, true);
  // Keyboard or a script click (no pointer).
  doc.addEventListener('click', (event) => { const btn = event.target.closest?.('.num-step'); if (btn && event.detail === 0 && !btn.disabled) step(btn); });
  // A re-render may disable the input after the buttons were made.
  new MutationObserver((records) => {
    for (const r of records) if (r.target.matches?.('input[type="number"]')) for (const b of r.target.closest('.num-box')?.querySelectorAll('.num-step') ?? []) b.disabled = r.target.disabled;
  }).observe(doc.body ?? doc.documentElement, { attributes: true, attributeFilter: ['disabled'], subtree: true });
}

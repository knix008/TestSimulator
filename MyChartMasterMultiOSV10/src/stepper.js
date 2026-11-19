// Number input used everywhere a value is typed (settings, toolbar, panels):
//   [ − ]  value  unit  [ + ]   (decrease, current value, unit, increase — the same order everywhere)
// The value sits in the middle (centred, editable); the unit is a label after it. The buttons step it, and
// keep stepping while held down. ArrowUp/ArrowDown in the field step too.
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * key: what the value is (passed to onChange); label: shown in tooltips.
 * `decreaseTip` / `increaseTip`: tooltips of the buttons.
 */
export function stepperHtml({ key, value, min = 0, max = 100, step = 1, unit = '', label = '', decreaseTip = '', increaseTip = '', disabled = false, id = '', optional = false, placeholder = '', free = false, start = null }) {
  const off = disabled ? 'disabled' : '';
  // optional: the field may be empty (an automatic value, shown as the placeholder); free: typed values keep their
  // decimals (only the buttons move by the step); step 'auto': the buttons move by about a tenth of the value's size.
  const extra = `${optional ? ' data-optional=""' : ''}${free ? ' data-free=""' : ''}${start != null ? ` data-start="${escapeHtml(start)}"` : ''}`;
  return `<span class="stepper ${disabled ? 'disabled' : ''}" data-stepper="${escapeHtml(key)}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${escapeHtml(unit)}"${extra} title="${escapeHtml(label)}">
    <button type="button" class="stepper-button" data-step-dir="-1" title="${escapeHtml(decreaseTip || `${label} −${step}`)}" aria-label="${escapeHtml(decreaseTip || `${label} −${step}`)}" ${off} ${Number(value) <= min ? 'data-at-limit' : ''}>${icon('minus')}</button>
    <input class="stepper-value" ${id ? `id="${escapeHtml(id)}"` : ''} type="text" inputmode="decimal" value="${escapeHtml(String(value ?? ''))}"${placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" ${off} />${unit ? `<span class="stepper-unit" aria-hidden="true">${escapeHtml(unit)}</span>` : ''}
    <button type="button" class="stepper-button" data-step-dir="1" title="${escapeHtml(increaseTip || `${label} +${step}`)}" aria-label="${escapeHtml(increaseTip || `${label} +${step}`)}" ${off} ${Number(value) >= max ? 'data-at-limit' : ''}>${icon('plus')}</button>
  </span>`;
}

const limits = (element) => ({
  min: Number(element.dataset.min),
  max: Number(element.dataset.max),
  step: Number(element.dataset.step) || 1,
  unit: element.dataset.unit ?? '',
});

/** The button step at a value: the field's step, or for step 'auto' a tenth of the value's order of magnitude. */
function stepAt(element, value) {
  if (element.dataset.step !== 'auto') return Number(element.dataset.step) || 1;
  const size = Math.abs(value);
  return size >= 1 ? 10 ** (Math.floor(Math.log10(size)) - (size >= 10 ? 1 : 0)) : size > 0 ? 10 ** Math.floor(Math.log10(size)) : 1;
}
const isEmpty = (element) => element.hasAttribute('data-optional') && String(element.querySelector('.stepper-value').value).trim() === '';

/** Rounds to the step and keeps the value within min…max. */
export function clampStep(value, { min, max, step }) {
  const number = Number.isFinite(value) ? value : min;
  const stepped = Math.round((number - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
}

export function stepperValue(element) {
  const input = element.querySelector('.stepper-value');
  const typed = parseFloat(String(input.value).replace(/[^0-9.eE+-]/g, ''));
  const l = limits(element);
  if (element.hasAttribute('data-free') || element.dataset.step === 'auto') return Number.isFinite(typed) ? Math.min(l.max, Math.max(l.min, typed)) : Math.max(l.min, Math.min(l.max, Number(element.dataset.start ?? 0)));
  return clampStep(typed, l);
}

function show(element, value) {
  const { min, max } = limits(element);
  element.querySelector('.stepper-value').value = String(value);
  const [down, up] = element.querySelectorAll('.stepper-button');
  down.toggleAttribute('data-at-limit', value <= min);
  up.toggleAttribute('data-at-limit', value >= max);
}

/**
 * Wires every stepper inside `root`. `onChange(key, value, element)` runs after
 * each step and when a typed value is confirmed (Enter / leaving the field).
 */
export function bindSteppers(root, onChange) {
  let repeat = null;
  const stop = () => {
    clearTimeout(repeat?.timeout);
    clearInterval(repeat?.interval);
    repeat = null;
  };
  const step = (button) => {
    const element = button.closest('.stepper');
    if (!element || element.classList.contains('disabled')) return;
    const l = limits(element);
    const from = isEmpty(element) ? Number(element.dataset.start ?? Math.max(l.min, Math.min(l.max, 0))) : stepperValue(element);
    const dir = Number(button.dataset.stepDir);
    const size = stepAt(element, dir < 0 && from > 0 ? from - stepAt(element, from) / 1e6 : from);
    const raw = Math.round((from + dir * size) / size) * size;
    const value = Math.min(l.max, Math.max(l.min, Number(raw.toFixed(6))));
    show(element, value);
    onChange(element.dataset.stepper, value, element);
  };
  root.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.stepper-button');
    if (!button || button.disabled || event.button !== 0) return;
    event.preventDefault();
    step(button);
    stop();
    repeat = { timeout: setTimeout(() => { repeat.interval = setInterval(() => step(button), 70); }, 400) };
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) root.addEventListener(type, stop, true);
  root.addEventListener('click', (event) => {
    // Keyboard activation (Enter / Space on the button) arrives as a click without a pointer.
    const button = event.target.closest('.stepper-button');
    if (button && event.detail === 0) step(button);
  });
  root.addEventListener('change', (event) => {
    if (!event.target.classList?.contains('stepper-value')) return;
    const element = event.target.closest('.stepper');
    if (isEmpty(element)) { onChange(element.dataset.stepper, '', element); return; }
    const value = stepperValue(element);
    show(element, value);
    onChange(element.dataset.stepper, value, element);
  });
  root.addEventListener('keydown', (event) => {
    if (!event.target.classList?.contains('stepper-value')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.target.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const element = event.target.closest('.stepper');
      step(element.querySelectorAll('.stepper-button')[event.key === 'ArrowUp' ? 1 : 0]);
    }
  });
}

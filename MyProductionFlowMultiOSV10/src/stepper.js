// Number input used everywhere a value is typed (settings, toolbar, panels):
//   [ − ]  value  [ + ]
// The value sits in the middle (centred, editable). The buttons step it, and
// keep stepping while held down. ArrowUp/ArrowDown in the field step too.
import { icon } from './icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * key: what the value is (passed to onChange); label: shown in tooltips.
 * `decreaseTip` / `increaseTip`: tooltips of the buttons.
 */
export function stepperHtml({ key, value, min = 0, max = 100, step = 1, unit = '', label = '', decreaseTip = '', increaseTip = '', disabled = false, id = '' }) {
  const off = disabled ? 'disabled' : '';
  return `<span class="stepper ${disabled ? 'disabled' : ''}" data-stepper="${escapeHtml(key)}" data-min="${min}" data-max="${max}" data-step="${step}" data-unit="${escapeHtml(unit)}" title="${escapeHtml(label)}">
    <button type="button" class="stepper-button" data-step-dir="-1" title="${escapeHtml(decreaseTip || `${label} −${step}`)}" aria-label="${escapeHtml(decreaseTip || `${label} −${step}`)}" ${off} ${Number(value) <= min ? 'data-at-limit' : ''}>${icon('minus')}</button>
    <input class="stepper-value" ${id ? `id="${escapeHtml(id)}"` : ''} type="text" inputmode="decimal" value="${escapeHtml(`${value}${unit}`)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" ${off} />
    <button type="button" class="stepper-button" data-step-dir="1" title="${escapeHtml(increaseTip || `${label} +${step}`)}" aria-label="${escapeHtml(increaseTip || `${label} +${step}`)}" ${off} ${Number(value) >= max ? 'data-at-limit' : ''}>${icon('plus')}</button>
  </span>`;
}

const limits = (element) => ({
  min: Number(element.dataset.min),
  max: Number(element.dataset.max),
  step: Number(element.dataset.step) || 1,
  unit: element.dataset.unit ?? '',
});

/** Rounds to the step and keeps the value within min…max. */
export function clampStep(value, { min, max, step }) {
  const number = Number.isFinite(value) ? value : min;
  const stepped = Math.round((number - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
}

export function stepperValue(element) {
  const input = element.querySelector('.stepper-value');
  return clampStep(parseFloat(String(input.value).replace(/[^0-9.+-]/g, '')), limits(element));
}

function show(element, value) {
  const { unit, min, max } = limits(element);
  element.querySelector('.stepper-value').value = `${value}${unit}`;
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
    const { step: size } = limits(element);
    const value = clampStep(stepperValue(element) + Number(button.dataset.stepDir) * size, limits(element));
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

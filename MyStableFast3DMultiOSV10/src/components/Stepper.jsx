import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconMinus, IconPlus } from './Icons.jsx';

// Every number the user sets has a − button on its left and a + button on its
// right, with the current value (and its unit) centred between them. A slider
// keeps its track between the buttons and shows the value centred above it.

// One step from `value`, kept on the step grid and inside [min, max]. With a
// `values` list (e.g. fixed intervals) the step moves to the neighbouring entry.
export function stepValue(value, dir, { min = -Infinity, max = Infinity, step = 1, values = null } = {}) {
  if (Array.isArray(values) && values.length) {
    const i = values.indexOf(value);
    if (i < 0) {
      // Not one of the choices: go to the nearest one in that direction.
      const next = dir > 0 ? values.find((v) => v > value) : [...values].reverse().find((v) => v < value);
      return next ?? value;
    }
    return values[Math.min(values.length - 1, Math.max(0, i + dir))];
  }
  const n = Number(value);
  const base = Number.isFinite(n) ? n : min;
  const decimals = (String(step).split('.')[1] || '').length;
  const raw = Math.round((base + dir * step) / step) * step;
  return Math.min(max, Math.max(min, Number(raw.toFixed(decimals))));
}

function atEnd(value, dir, { min, max, values }) {
  if (Array.isArray(values) && values.length) return dir < 0 ? value <= values[0] : value >= values[values.length - 1];
  return dir < 0 ? value <= min : value >= max;
}

function StepButton({ dir, label, disabled, onClick }) {
  const { t } = useTranslation();
  const name = `${label ? `${label} — ` : ''}${t(dir < 0 ? 'common.decrease' : 'common.increase')}`;
  const Icon = dir < 0 ? IconMinus : IconPlus;
  return (
    <button
      type="button"
      className="btn stepper-btn"
      disabled={disabled}
      onClick={onClick}
      title={name}
      aria-label={name}
      data-step={dir < 0 ? 'dec' : 'inc'}
    >
      <Icon size={15} />
    </button>
  );
}

// − value unit +   (copies, intervals, …)
export function NumberStepper({
  value, onChange, min = -Infinity, max = Infinity, step = 1, values = null,
  format = (v) => String(v), label, disabled = false, className = '',
}) {
  const opts = { min, max, step, values };
  return (
    <div className={`stepper${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      <StepButton dir={-1} label={label} disabled={disabled || atEnd(value, -1, opts)} onClick={() => onChange(stepValue(value, -1, opts))} />
      <output className="stepper-value" aria-live="polite">{format(value)}</output>
      <StepButton dir={1} label={label} disabled={disabled || atEnd(value, 1, opts)} onClick={() => onChange(stepValue(value, 1, opts))} />
    </div>
  );
}

// − [ value / track ] +   (sliders)
export function RangeStepper({
  value, onChange, min, max, step = 1,
  format = (v) => String(v), label, disabled = false, className = '',
}) {
  const opts = { min, max, step };
  return (
    <div className={`range-stepper${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      <StepButton dir={-1} label={label} disabled={disabled || atEnd(value, -1, opts)} onClick={() => onChange(stepValue(value, -1, opts))} />
      <div className="range-stepper-mid">
        <output className="range-stepper-value" aria-live="polite">{format(value)}</output>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          title={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <StepButton dir={1} label={label} disabled={disabled || atEnd(value, 1, opts)} onClick={() => onChange(stepValue(value, 1, opts))} />
    </div>
  );
}

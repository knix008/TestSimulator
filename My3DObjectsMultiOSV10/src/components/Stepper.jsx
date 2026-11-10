import React, { useEffect, useRef, useState } from 'react';
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

// − [ value unit ] +   (a number the user may also type). The value and its
// unit sit together in the middle of the box; typing commits on Enter or
// when the box loses focus, the buttons step at once.
export function NumberBox({
  value, onChange, min = -Infinity, max = Infinity, step = 1, unit = '', label, disabled = false, className = '',
}) {
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef(null);
  useEffect(() => { setDraft(String(value)); }, [value]);
  const opts = { min, max, step };
  const num = Number(value);
  const commit = (raw) => {
    const n = Number(String(raw).trim());
    if (String(raw).trim() === '' || !Number.isFinite(n)) { setDraft(String(value)); return; }
    const v = Math.min(max, Math.max(min, n));
    setDraft(String(v));
    if (v !== num) onChange(v);
  };
  return (
    <div className={`numbox${className ? ` ${className}` : ''}${disabled ? ' disabled' : ''}`} role="group" aria-label={label}>
      <StepButton dir={-1} label={label} disabled={disabled || atEnd(num, -1, opts)} onClick={() => onChange(stepValue(num, -1, opts))} />
      {/* A click anywhere in the box (beside the digits too) edits the number. */}
      <div className="numbox-field" onMouseDown={(e) => { if (e.target !== inputRef.current) { e.preventDefault(); inputRef.current?.focus(); } }}>
        <input
          ref={inputRef}
          className="numbox-input"
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          style={{ width: `${Math.max(1, draft.length) + 0.6}ch` }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(stepValue(num, e.key === 'ArrowUp' ? 1 : -1, opts));
            }
          }}
          aria-label={label}
          title={label}
        />
        {unit ? <span className="numbox-unit">{unit}</span> : null}
      </div>
      <StepButton dir={1} label={label} disabled={disabled || atEnd(num, 1, opts)} onClick={() => onChange(stepValue(num, 1, opts))} />
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

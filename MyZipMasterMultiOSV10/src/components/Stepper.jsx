import React from 'react';

// One step down or up, landing on multiples of the step: from 105 by 10, up is 110 and down is 100.
export function stepValue(value, direction, step, min, max) {
  const v = Number(value);
  const base = Number.isFinite(v) ? v : (min ?? 0);
  const next = direction > 0 ? (Math.floor(base / step + 1e-9) + 1) * step : (Math.ceil(base / step - 1e-9) - 1) * step;
  const low = min ?? -Infinity;
  const high = max ?? Infinity;
  return Math.min(high, Math.max(low, Math.round(next * 1000) / 1000));
}

// Every number in the program looks like this: decrease, the value and its unit, increase.
export default function Stepper({ id, value, unit, step = 1, min, max, onChange, disabled, invalid, unitNode, label }) {
  const v = Number(value);
  const set = (direction) => onChange(String(stepValue(value, direction, step, min, max)));
  return (
    <span className={`stepper${invalid ? ' invalid' : ''}${disabled ? ' off' : ''}`} data-stepper={id} title={label}>
      <button type="button" className="stepper-btn" data-testid={`${id}-dec`} aria-label="-" disabled={disabled || (min != null && v <= min)} onClick={() => set(-1)}>−</button>
      <input className="stepper-value" data-testid={id} inputMode="decimal" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
      {unitNode ?? (unit ? <span className="stepper-unit">{unit}</span> : null)}
      <button type="button" className="stepper-btn" data-testid={`${id}-inc`} aria-label="+" disabled={disabled || (max != null && v >= max)} onClick={() => set(1)}>+</button>
    </span>
  );
}

// A value that also has a drag bar: the bar, then the same less, value and unit, more.
export function SliderStepper({ id, value, unit, step = 1, min = 0, max = 100, onChange, label }) {
  const v = Number(value);
  return (
    <span className="slider-stepper" data-slider={id}>
      {label && <span className="slider-label">{label}</span>}
      <input type="range" className="slider-bar" data-testid={`${id}-range`} aria-label={label} min={min} max={max} step={step} value={Number.isFinite(v) ? v : min} onChange={(e) => onChange(e.target.value)} />
      <Stepper id={id} value={value} unit={unit} step={step} min={min} max={max} onChange={onChange} />
    </span>
  );
}

// How far one press moves a size: ten megabytes at a time in MB.
export const SIZE_STEP = { B: 1024, KB: 100, MB: 10, GB: 1 };

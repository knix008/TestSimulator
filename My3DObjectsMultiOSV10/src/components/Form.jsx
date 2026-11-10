import React from 'react';
import { NumberBox } from './Stepper.jsx';

// Small form controls for the settings panels, all on the app's .field /
// .check / .input styles so every panel reads the same.

export function Section({ title, children, actions = null }) {
  return (
    <section className="info-section form-section">
      <h4>
        <span>{title}</span>
        {actions ? <span className="form-section-actions">{actions}</span> : null}
      </h4>
      {children}
    </section>
  );
}

export function Check({ label, checked, onChange, tip, disabled }) {
  return (
    <label className={`check${disabled ? ' disabled' : ''}`} title={tip || label}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SelectField({ label, value, options, onChange, tip, disabled }) {
  return (
    <label className="field" title={tip || label}>
      <span className="field-label">{label}</span>
      <select className="input" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  );
}

// A slider with the number beside it: − [ value unit ] +, the number can be
// typed too.
export function RangeField({ label, value, min, max, step = 0.01, onChange, tip, unit = '', disabled }) {
  return (
    <div className="field range-field" title={tip || label}>
      <span className="field-label">{label}</span>
      <div className="range-row">
        <input
          type="range"
          className="range"
          min={min}
          max={max}
          step={step}
          value={Number(value)}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <NumberBox value={Number(value)} min={min} max={max} step={step} unit={unit} label={label} disabled={disabled} onChange={onChange} />
      </div>
    </div>
  );
}

// A number on its own: − [ value unit ] +.
export function NumberField({ label, value, onChange, step = 1, min, max, tip, unit = '', disabled }) {
  return (
    <div className="field" title={tip || label}>
      <span className="field-label">{label}</span>
      <NumberBox
        className="wide"
        value={Number(value)}
        min={min ?? -Infinity}
        max={max ?? Infinity}
        step={step}
        unit={unit}
        label={label}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

export function ColorField({ label, value, onChange, tip }) {
  return (
    <label className="field color-field" title={tip || label}>
      <span className="field-label">{label}</span>
      <span className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <code>{value}</code>
      </span>
    </label>
  );
}

// Three numbers in a row (a position, a rotation), each − [ value unit ] +.
export function Vec3Field({ label, value, onChange, step = 0.1, unit = '', tip }) {
  const set = (i, n) => {
    const next = [...value];
    next[i] = n;
    onChange(next);
  };
  return (
    <div className="field" title={tip || label}>
      <span className="field-label">{label}</span>
      <div className="vec3">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <div key={axis} className={`vec3-cell axis-${axis.toLowerCase()}`}>
            <span>{axis}</span>
            <NumberBox
              className="compact"
              value={Math.round(Number(value[i]) * 1000) / 1000}
              step={step}
              unit={unit}
              label={`${label} ${axis}`}
              onChange={(n) => set(i, n)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="field">
      {label ? <span className="field-label">{label}</span> : null}
      <div className="row seg-row seg-fill" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            className={`btn seg small${String(value) === String(o.value) ? ' active' : ''}`}
            onClick={() => onChange(o.value)}
            title={o.tip || o.label}
            role="radio"
            aria-checked={String(value) === String(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

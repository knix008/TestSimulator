import React, { useEffect, useState } from 'react';

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

// A slider with the number beside it; the number can be typed too.
export function RangeField({ label, value, min, max, step = 0.01, onChange, tip, format, disabled }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (raw) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setDraft(String(value));
  };
  return (
    <div className="field range-field" title={tip || label}>
      <span className="field-label">
        {label}
        {format ? <em className="hint">{format(value)}</em> : null}
      </span>
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
        <input
          className="input num"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export function NumberField({ label, value, onChange, step = 1, min, max, tip, disabled, placeholder }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <label className="field" title={tip || label}>
      <span className="field-label">{label}</span>
      <input
        className="input"
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
      />
    </label>
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

// Three numbers in a row (a position, a rotation).
export function Vec3Field({ label, value, onChange, step = 0.1, tip }) {
  const [draft, setDraft] = useState(value.map(String));
  useEffect(() => { setDraft(value.map((n) => String(Math.round(n * 1000) / 1000))); }, [value]);
  const commit = (i, raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) { setDraft(value.map(String)); return; }
    const next = [...value];
    next[i] = n;
    onChange(next);
  };
  return (
    <div className="field" title={tip || label}>
      <span className="field-label">{label}</span>
      <div className="vec3">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <label key={axis} className={`vec3-cell axis-${axis.toLowerCase()}`}>
            <span>{axis}</span>
            <input
              className="input"
              type="number"
              step={step}
              value={draft[i]}
              onChange={(e) => { const d = [...draft]; d[i] = e.target.value; setDraft(d); }}
              onBlur={(e) => commit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(i, e.currentTarget.value); }}
              aria-label={`${label} ${axis}`}
            />
          </label>
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

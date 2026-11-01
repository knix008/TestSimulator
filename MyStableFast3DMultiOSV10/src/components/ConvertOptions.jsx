import React from 'react';
import { Check, SelectField, RangeField, NumberField } from './Form.jsx';

// The conversion options as the engine describes them (models/__init__.py):
// the right panel's Convert tab and the conversion settings window both draw
// them with OptionField, so the two always agree.

// Before an engine that sends `common` answers: the options every model takes.
export const FALLBACK_COMMON = [
  { key: 'removeBackground', type: 'bool', default: true, group: 'input' },
  { key: 'foregroundRatio', type: 'number', default: 0.85, min: 0.5, max: 1, step: 0.05, group: 'input' },
];

// The options a finished result can redo without the model (the engine's
// pipeline.SURFACE_OPTIONS).
export const SURFACE_KEYS = ['minPartSize', 'subdivide', 'smoothing', 'straighten'];

export function commonOptions(model) {
  return model?.common || FALLBACK_COMMON;
}

// input → the image before the model, model → the model's own options,
// surface → the clean-up of its mesh.
export function groupOptions(model) {
  const common = commonOptions(model);
  const input = common.filter((o) => (o.group || (SURFACE_KEYS.includes(o.key) ? 'surface' : 'input')) === 'input');
  const surface = common.filter((o) => !input.includes(o));
  return { input, model: model?.options || [], surface };
}

// The values stored for one model (only what the user changed) and the
// effective value of an option.
export function optionValues(settings, modelId) {
  return settings.convertOptions?.[modelId] || {};
}

export const valueOf = (values, o) => (values[o.key] !== undefined ? values[o.key] : o.default);

// Has any of these options been changed from its recommended value?
export function changedFromDefault(values, opts) {
  return opts.some((o) => values[o.key] !== undefined && String(values[o.key]) !== String(o.default));
}

// Every option's tip ends with the recommended value, which is its default.
function recommended(o, t) {
  if (o.type === 'bool') return t(o.default ? 'opt.on' : 'opt.off');
  if (o.type === 'select' && o.default === 'auto' && o.deviceDefault) return t('opt.auto', { gpu: o.deviceDefault.gpu, cpu: o.deviceDefault.cpu });
  if (o.type === 'select') return t(`opt.${o.key}Choice.${o.default}`, String(o.default));
  return String(o.default);
}

export function OptionField({ o, value, onChange, t, disabled = false }) {
  const label = t(`opt.${o.key}`, o.key);
  const tip = [t(`optTip.${o.key}`, ''), t('opt.recommended', { value: recommended(o, t) })].filter(Boolean).join(' ');
  if (o.type === 'bool') {
    return <Check label={label} tip={tip} checked={value} disabled={disabled} onChange={onChange} />;
  }
  if (o.type === 'select') {
    return (
      <SelectField
        label={label}
        tip={tip}
        value={value}
        disabled={disabled}
        options={o.choices.map((c) => ({
          value: c.value,
          label: c.value === 'auto' && o.deviceDefault
            ? t('opt.auto', { gpu: o.deviceDefault.gpu, cpu: o.deviceDefault.cpu })
            : t(`opt.${o.key}Choice.${c.value}`, String(c.value)),
        }))}
        onChange={onChange}
      />
    );
  }
  if (o.allowOff !== undefined) {
    const off = Number(value) === o.allowOff;
    return (
      <div>
        <Check label={label} tip={tip} checked={!off} disabled={disabled} onChange={(on) => onChange(on ? 10000 : o.allowOff)} />
        {off ? null : (
          <NumberField label={t('opt.target')} value={value} min={o.min} max={o.max} step={o.step} onChange={onChange} />
        )}
      </div>
    );
  }
  // A slider for a short range; a number box when there are too many values
  // to pick on one (the seed).
  return (o.max - o.min) / (o.step || 1) > 1000
    ? <NumberField label={label} tip={tip} value={Number(value)} min={o.min} max={o.max} step={o.step} onChange={onChange} />
    : <RangeField label={label} tip={tip} value={Number(value)} min={o.min} max={o.max} step={o.step} disabled={disabled} onChange={onChange} />;
}

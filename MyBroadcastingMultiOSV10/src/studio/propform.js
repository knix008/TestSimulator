// Forms drawn from catalogue fields (bc/catalog.js): source properties, filter settings, transition
// settings. Every control carries data-form="<scope>" and data-key="<key>"; the app's input/change
// handler (app.js formInput) reads the value with readField() and hands it to the studio.
// Numbers are steppers "− value +", sliders have − / + beside them and the value on the right, lists
// are <select> (they get icons from ui/dropdown.js), files have a Browse button.
import { visibleFields } from '../bc/catalog.js';
import { icon } from '../icons.js';
import { hasText, t } from '../i18n.js';
import { stepperHtml } from '../stepper.js';
import { escapeHtml as esc } from '../ui/dom.js';
import { baseName } from '../bc/platform.js';

export const fieldLabel = (f) => t(f.label ?? `prop.${f.key}`, null, f.key);
export const optionLabel = (f, v) => (hasText(`opt.${f.key}.${v}`) ? t(`opt.${f.key}.${v}`) : hasText(`opt.${v}`) ? t(`opt.${v}`) : String(v));

const fileName = (v) => {
  const s = typeof v === 'object' && v ? v.value ?? v.path : v;
  if (!s) return '';
  if (String(s).startsWith('sample:')) return `${t('prop.sample')} · ${String(s).slice(7)}`;
  if (String(s).startsWith('asset:')) return t('prop.storedFile');
  return baseName(s);
};

/** One field's control (the value cell of a form row). */
export function controlHtml(f, value, scope, ctx = {}) {
  const k = esc(f.key);
  const s = esc(scope);
  const label = fieldLabel(f);
  switch (f.type) {
    case 'number':
      return stepperHtml({ key: `${scope}|${f.key}`, value, min: f.min, max: f.max, step: f.step, unit: f.unit ?? '', label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }) });
    case 'slider': {
      const digits = String(f.step).includes('.') ? String(f.step).split('.')[1].length : 0;
      return `<span class="slider-row" data-slider="${s}|${k}">
        <button type="button" class="slider-step" data-slider-step="-1" title="${esc(t('stepper.decrease', { label }))}" aria-label="${esc(t('stepper.decrease', { label }))}">−</button>
        <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${value}" data-form="${s}" data-key="${k}" aria-label="${esc(label)}" />
        <button type="button" class="slider-step" data-slider-step="1" title="${esc(t('stepper.increase', { label }))}" aria-label="${esc(t('stepper.increase', { label }))}">+</button>
        <output data-digits="${digits}" data-unit="${esc(f.unit ?? '')}">${Number(value).toFixed(digits)}${esc(f.unit ?? '')}</output></span>`;
    }
    case 'bool':
      return `<label class="check-row"><input type="checkbox" data-form="${s}" data-key="${k}" ${value ? 'checked' : ''} /><span>${esc(label)}</span></label>`;
    case 'text':
      return `<input type="${f.secret ? 'password' : 'text'}" class="text-input" data-form="${s}" data-key="${k}" value="${esc(value ?? '')}" aria-label="${esc(label)}" spellcheck="false" />`;
    case 'textarea':
      return `<textarea class="text-input mono" rows="${f.rows ?? 4}" data-form="${s}" data-key="${k}" aria-label="${esc(label)}" spellcheck="false">${esc(value ?? '')}</textarea>`;
    case 'color':
      return `<span class="color-row"><input type="color" data-form="${s}" data-key="${k}" value="${esc(String(value ?? '#000000').slice(0, 7))}" aria-label="${esc(label)}" /><code>${esc(value)}</code></span>`;
    case 'select':
      return `<select data-form="${s}" data-key="${k}" aria-label="${esc(label)}" data-icon="${esc(f.icon ?? 'listBullet')}">${f.options.map((o) => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? t(o[1], null, o[1]) : optionLabel(f, v); return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
    case 'file':
      return `<span class="file-row"><span class="file-name" title="${esc(value ?? '')}">${icon(value ? 'fileImage' : 'fileNone')}<span>${esc(fileName(value) || t('prop.noFile'))}</span></span>
        <button type="button" class="small-button" data-form-file="${s}|${k}" data-accept="${esc(f.accept ?? '')}" title="${esc(t('prop.browse'))}">${icon('folderOpen')}<span>${esc(t('prop.browse'))}</span></button>
        ${value ? `<button type="button" class="icon-button" data-form-clear="${s}|${k}" title="${esc(t('prop.clearFile'))}" aria-label="${esc(t('prop.clearFile'))}">${icon('close')}</button>` : ''}</span>`;
    case 'files': {
      const list = Array.isArray(value) ? value : [];
      const rows = list.map((v, i) => `<div class="files-item" title="${esc(typeof v === 'object' ? v.value : v)}">${icon('fileMedia')}<span class="grow">${esc(fileName(v))}</span>
        <button type="button" class="icon-button" data-form-files="${s}|${k}|up|${i}" ${i ? '' : 'disabled'} title="${esc(t('prop.moveUp'))}" aria-label="${esc(t('prop.moveUp'))}">${icon('arrowUp')}</button>
        <button type="button" class="icon-button" data-form-files="${s}|${k}|down|${i}" ${i < list.length - 1 ? '' : 'disabled'} title="${esc(t('prop.moveDown'))}" aria-label="${esc(t('prop.moveDown'))}">${icon('arrowDown')}</button>
        <button type="button" class="icon-button danger" data-form-files="${s}|${k}|remove|${i}" title="${esc(t('prop.remove'))}" aria-label="${esc(t('prop.remove'))}">${icon('trash')}</button></div>`).join('');
      return `<div class="files-list">${rows || `<p class="muted">${esc(t('prop.noFiles'))}</p>`}
        <button type="button" class="small-button" data-form-files="${s}|${k}|add" data-accept="${esc(f.accept ?? '')}">${icon('plus')}<span>${esc(t('prop.addFiles'))}</span></button></div>`;
    }
    case 'font': {
      const v = value ?? {};
      const faces = ctx.fonts?.length ? ctx.fonts : ['Arial', 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact'];
      const all = faces.includes(v.face) ? faces : [v.face, ...faces].filter(Boolean);
      return `<div class="font-row">
        <select data-form="${s}" data-key="${k}.face" data-icon="font" aria-label="${esc(t('prop.fontFace'))}">${all.map((x) => `<option value="${esc(x)}" ${x === v.face ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        ${stepperHtml({ key: `${scope}|${f.key}.size`, value: v.size ?? 72, min: 4, max: 1000, step: 1, unit: 'px', label: t('prop.fontSize'), decreaseTip: t('stepper.decrease', { label: t('prop.fontSize') }), increaseTip: t('stepper.increase', { label: t('prop.fontSize') }) })}
        <span class="seg-toggle font-style">${['bold', 'italic', 'underline', 'strikeout'].map((st) => `<button type="button" class="${v[st] ? 'active' : ''}" data-form-toggle="${s}|${k}.${st}" aria-pressed="${Boolean(v[st])}" title="${esc(t(`prop.font.${st}`))}">${icon(`font${st[0].toUpperCase()}${st.slice(1)}`)}</button>`).join('')}</span></div>`;
    }
    case 'device': {
      const list = (ctx.devices ?? []).filter((d) => d.kind === f.kind);
      const opts = [['default', t('prop.deviceDefault')], ...list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => [d.deviceId, d.label || `${t(`prop.kind.${f.kind}`)} ${i + 1}`])];
      if (f.kind === 'audiooutput' && !list.length) opts.splice(1, 0);
      const known = opts.some(([id]) => id === value);
      if (value && !known) opts.push([value, t('prop.deviceMissing')]);
      return `<span class="device-row"><select data-form="${s}" data-key="${k}" data-icon="${f.kind === 'videoinput' ? 'srcCamera' : f.kind === 'audioinput' ? 'srcMic' : 'srcSpeaker'}" aria-label="${esc(label)}">${opts.map(([id, l]) => `<option value="${esc(id)}" ${id === (value || 'default') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <button type="button" class="icon-button" data-form-action="refresh-devices" title="${esc(t('prop.refreshDevices'))}" aria-label="${esc(t('prop.refreshDevices'))}">${icon('refresh')}</button></span>`;
    }
    case 'source': {
      const list = ctx.audioSources ?? [];
      return `<select data-form="${s}" data-key="${k}" data-icon="srcMic" aria-label="${esc(label)}"><option value="">${esc(t('prop.none'))}</option>${list.map((x) => `<option value="${esc(x.id)}" ${x.id === value ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
    }
    case 'button':
      return `<button type="button" class="button" data-form-action="${esc(f.action)}" data-form-scope="${s}">${icon(f.action === 'pick-capture' ? 'capturePick' : 'refresh')}<span>${esc(t(`prop.action.${f.action}`))}</span></button>`;
    default:
      return `<span class="muted">${esc(String(value ?? ''))}</span>`;
  }
}

/** A whole form: one row per visible field (label · control), checkboxes spanning both columns. */
export function formHtml(fields, settings, scope, ctx = {}) {
  const rows = visibleFields(fields, settings).map((f) => {
    const value = f.key.split('.').reduce((o, p) => o?.[p], settings);
    if (f.type === 'bool') return `<div class="form-row wide" data-row="${esc(f.key)}">${controlHtml(f, value, scope, ctx)}</div>`;
    if (f.type === 'button') return `<div class="form-row wide" data-row="${esc(f.key)}">${controlHtml(f, value, scope, ctx)}</div>`;
    return `<div class="form-row" data-row="${esc(f.key)}"><label class="form-label">${esc(fieldLabel(f))}</label><div class="form-control">${controlHtml(f, value, scope, ctx)}</div></div>`;
  });
  return rows.length ? `<div class="prop-form" data-form-scope="${esc(scope)}">${rows.join('')}</div>` : `<p class="muted form-empty">${icon('info')}<span>${esc(t('prop.noProperties'))}</span></p>`;
}

/** The value of a changed control (number, boolean, text, colour). */
export function readField(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'range' || el.inputMode === 'decimal') return Number(el.value);
  return el.value;
}

/** Sets `path` ("font.size") inside a copy of `obj`. */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) { cur[keys[i]] = { ...(cur[keys[i]] ?? {}) }; cur = cur[keys[i]]; }
  cur[keys.at(-1)] = value;
  return out;
}

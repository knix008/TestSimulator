// The `form` popup: a generic dialog drawn from a list of fields (ARCHITECTURE.md §8).
//
//   const result = await popups.open('form', {
//     title, icon (app icon name), intro?, submitLabel?, cancelLabel?,
//     fields: [{ name, type, label, value?, options?, required?, placeholder?, hint?, glyph?, min?, max?, step?,
//                allowNew? (multiselect: free text), when? { otherField: value | [values] } (shown only then) }],
//   });
//   → { values: { name: value } } or null (cancelled)
//
// types: text · textarea · number (−/+ stepper; empty = null) · select · multiselect · user (the app's IconRef
// dropdowns, never a native list) · date ('YYYY-MM-DD' | null) · icon (IconRef; the icon picker opens) ·
// checkbox (boolean) · duration (seconds | null; '1h 30m', '2d', '1주 2일') · color ('#rrggbb' | '').
// options: [{ value, label, iconRef?, glyph?, hint?, when? }] — an option with `when` shows only while the other
// field has that value (types of the chosen project). An icon field asks the main window for the picker
// (action 'form-pick-icon' → host message { type: 'form-icon', name, ref }).
import { stepperHtml, stepperValue } from '../stepper.js';
import { renderIconRef } from './iconref.js';
import { openRefList, refButtonHtml, closeRefList } from '../views/shared/refdropdown.js';
import { formatDuration, parseDuration } from '../views/shared/format.js';
import { registerTexts } from '../i18n.js';
import { ko, en } from '../views/shared/texts.js';
import '../views/shared/shared.css';
import './formpopup.css';

registerTexts({ ko, en });

const TYPE_GLYPHS = { text: 'edit', textarea: 'notes', number: 'percent', select: 'list', multiselect: 'tag', user: 'user', date: 'calendar', icon: 'iconInsert', checkbox: 'check', duration: 'clock', color: 'palette' };
const COLORS = ['#e03131', '#f08c00', '#f59f00', '#2f9e44', '#0ca678', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c', '#868e96', '#495057'];

let bound = false;
let form = null; // { at, values, touched, errors }

const visibleWhen = (when, values) => !when || Object.entries(when).every(([name, want]) => (Array.isArray(want) ? want.map(String).includes(String(values[name] ?? '')) : String(values[name] ?? '') === String(want ?? '')));

function initialValue(field) {
  const v = field.value;
  switch (field.type) {
    case 'multiselect': return Array.isArray(v) ? [...v] : [];
    case 'checkbox': return Boolean(v);
    case 'number': case 'duration': return v == null || v === '' ? null : Number(v);
    default: return v ?? '';
  }
}

/** The options of a field that apply now (their `when` matches). */
const optionsOf = (field, values) => (field.options ?? []).filter((o) => visibleWhen(o.when, values));

/** Keeps dependent choices valid: a chosen option that no longer applies gives way to the first that does. */
function settle(fields, values) {
  for (const field of fields) {
    if (!['select', 'user', 'multiselect'].includes(field.type)) continue;
    const opts = optionsOf(field, values);
    if (field.type === 'multiselect') { if (!field.allowNew) values[field.name] = values[field.name].filter((v) => opts.some((o) => String(o.value) === String(v))); continue; }
    if (values[field.name] !== '' && values[field.name] != null && !opts.some((o) => String(o.value) === String(values[field.name]))) values[field.name] = field.required && opts[0] ? opts[0].value : '';
    if (field.required && (values[field.name] === '' || values[field.name] == null) && opts[0] && field.type === 'select') values[field.name] = opts[0].value;
  }
}

export function renderFormPopup(api) {
  const { root, P, t, icon, escapeHtml, frame, button, row, fitHeight, ready } = api;
  const p = P();
  const fields = Array.isArray(p.fields) ? p.fields : [];
  if (!form || form.at !== p.at) {
    form = { at: p.at, values: Object.fromEntries(fields.map((f) => [f.name, initialValue(f)])), errors: {} };
    settle(fields, form.values);
  }
  const values = form.values;
  const control = (field) => {
    const id = `ff-${field.name}`;
    const value = values[field.name];
    const invalid = form.errors[field.name] ? 'invalid' : '';
    const label = field.label ?? field.name;
    const ph = escapeHtml(field.placeholder ?? '');
    switch (field.type) {
      case 'textarea':
        return `<textarea id="${id}" class="ff-textarea ${invalid}" data-ff="${escapeHtml(field.name)}" rows="${Number(field.rows) || 4}" placeholder="${ph}" aria-label="${escapeHtml(label)}">${escapeHtml(value)}</textarea>`;
      case 'number':
        return stepperHtml({ key: `form:${field.name}`, value: value ?? '', min: field.min ?? 0, max: field.max ?? 9999, step: field.step ?? 1, unit: field.unit ?? '', label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }), id });
      case 'select': case 'user': {
        const items = optionsOf(field, values).map((o) => ({ ...o, glyph: o.glyph ?? (field.type === 'user' ? 'user' : undefined) }));
        if (!field.required) items.unshift({ value: '', label: field.noneLabel ?? t('form.none'), glyph: field.type === 'user' ? undefined : 'close', html: field.type === 'user' ? '<span class="mb-avatar-none" style="width:16px;height:16px"></span>' : undefined });
        return refButtonHtml({ id: field.name, items, value: value === null ? '' : value, placeholder: field.placeholder ?? t('form.choose'), icon, extraClass: `ff-ref ${invalid}`, title: label });
      }
      case 'multiselect': {
        const items = optionsOf(field, values);
        for (const v of value) if (!items.some((o) => String(o.value) === String(v))) items.push({ value: v, label: v, glyph: 'tag' });
        return refButtonHtml({ id: field.name, items, value, placeholder: field.placeholder ?? t('form.chooseMany'), icon, extraClass: `ff-ref ${invalid}`, title: label });
      }
      case 'date':
        return `<span class="ff-date"><input id="${id}" type="date" class="${invalid}" data-ff="${escapeHtml(field.name)}" value="${escapeHtml(value ?? '')}" aria-label="${escapeHtml(label)}" />${value ? `<button type="button" class="icon-button" data-ff-clear="${escapeHtml(field.name)}" title="${escapeHtml(t('form.clear'))}" aria-label="${escapeHtml(t('form.clear'))}">${icon('close')}</button>` : ''}</span>`;
      case 'icon':
        return `<span class="ff-icon"><button type="button" class="small-button ff-icon-button" data-ff-icon="${escapeHtml(field.name)}" title="${escapeHtml(t('form.pickIcon'))}">${value ? renderIconRef(value, { size: 18 }) : icon('iconInsert')}<span>${escapeHtml(value ? t('form.changeIcon') : t('form.pickIcon'))}</span></button>${value ? `<button type="button" class="icon-button" data-ff-clear="${escapeHtml(field.name)}" title="${escapeHtml(t('form.clear'))}" aria-label="${escapeHtml(t('form.clear'))}">${icon('close')}</button>` : ''}</span>`;
      case 'checkbox':
        return `<label class="switch-wrap" title="${escapeHtml(label)}"><input id="${id}" type="checkbox" data-ff-check="${escapeHtml(field.name)}" ${value ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`;
      case 'duration': {
        const text = form.durationText?.[field.name] ?? (value ? formatDuration(value, api.L()) : '');
        const parsed = parseDuration(text);
        const note = text && Number.isNaN(parsed) ? `<small class="danger-text">${escapeHtml(t('form.badDuration'))}</small>` : parsed ? `<small class="muted ff-duration-note">= ${escapeHtml(formatDuration(parsed, api.L()))}</small>` : '';
        return `<input id="${id}" type="text" class="${invalid || (text && Number.isNaN(parsed) ? 'invalid' : '')}" data-ff-duration="${escapeHtml(field.name)}" value="${escapeHtml(text)}" placeholder="${ph || escapeHtml(t('form.durationHint'))}" aria-label="${escapeHtml(label)}" />${note}`;
      }
      case 'color':
        return `<span class="ff-colors" role="radiogroup" aria-label="${escapeHtml(label)}"><button type="button" class="swatch swatch-none ${!value ? 'active' : ''}" data-ff-color="${escapeHtml(field.name)}" data-value="" title="${escapeHtml(t('form.none'))}" aria-label="${escapeHtml(t('form.none'))}"></button>${COLORS.map((c) => `<button type="button" class="swatch ${String(value).toLowerCase() === c ? 'active' : ''}" data-ff-color="${escapeHtml(field.name)}" data-value="${c}" style="--swatch:${c}" title="${c}" aria-label="${c}"></button>`).join('')}<input type="color" data-ff-color-custom="${escapeHtml(field.name)}" value="${/^#[0-9a-f]{6}$/i.test(value) ? value : '#4472c4'}" title="${escapeHtml(t('form.customColor'))}" aria-label="${escapeHtml(t('form.customColor'))}" /></span>`;
      default:
        return `<input id="${id}" type="text" class="${invalid}" data-ff="${escapeHtml(field.name)}" value="${escapeHtml(value ?? '')}" placeholder="${ph}" maxlength="${Number(field.maxLength) || 1000}" aria-label="${escapeHtml(label)}" />`;
    }
  };
  const rows = fields.filter((f) => visibleWhen(f.when, values)).map((field) => {
    const label = `${field.label ?? field.name}${field.required ? ' *' : ''}`;
    const error = form.errors[field.name] ? `<small class="danger-text ff-error">${escapeHtml(form.errors[field.name])}</small>` : field.hint ? `<small class="muted ff-hint">${escapeHtml(field.hint)}</small>` : '';
    return `<div class="ff-field" data-ff-row="${escapeHtml(field.name)}">${row(field.glyph ?? TYPE_GLYPHS[field.type] ?? 'edit', label, control(field), field.label ?? field.name, `ff-type-${field.type ?? 'text'}`)}${error ? `<div class="ff-note">${error}</div>` : ''}</div>`;
  }).join('');
  const focusName = root.ownerDocument.activeElement?.closest?.('[data-ff-row]')?.dataset.ffRow;
  root.innerHTML = frame({
    glyph: p.icon ?? 'edit', title: p.title ?? '',
    body: `<form class="ff editor" novalidate>${p.intro ? `<p class="muted ff-intro">${escapeHtml(p.intro)}</p>` : ''}${rows}</form>`,
    foot: `<span class="muted ff-required">${fields.some((f) => f.required) ? escapeHtml(t('form.requiredNote')) : ''}</span><span class="grow"></span>${button('close', p.cancelLabel ?? t('common.cancel'), 'close')}${button('form-submit', p.submitLabel ?? t('common.ok'), 'check', 'primary')}`,
  });
  if (!bound) { bind(api, () => fields); bound = true; }
  api.fields = () => (Array.isArray(P().fields) ? P().fields : []);
  fitHeight();
  const target = (focusName && root.querySelector(`[data-ff-row="${CSS.escape(focusName)}"] input, [data-ff-row="${CSS.escape(focusName)}"] textarea, [data-ff-row="${CSS.escape(focusName)}"] button`)) || root.querySelector('.ff input:not([type="checkbox"]):not([type="color"]), .ff textarea, .ff .mb-refbutton');
  if (!form.focused || focusName) { target?.focus(); form.focused = true; }
  ready();
}

/** Reads the typed values (text boxes, steppers, durations) into the form state. */
function collect(root, fields) {
  for (const field of fields) {
    const rowEl = root.querySelector(`[data-ff-row="${CSS.escape(field.name)}"]`);
    if (!rowEl) continue;
    if (field.type === 'number') {
      const stepper = rowEl.querySelector('.stepper');
      const raw = stepper?.querySelector('.stepper-value')?.value.trim() ?? '';
      form.values[field.name] = raw === '' ? null : stepperValue(stepper);
    } else if (field.type === 'duration') {
      const text = rowEl.querySelector('[data-ff-duration]')?.value ?? '';
      form.durationText = { ...form.durationText, [field.name]: text };
      const parsed = parseDuration(text);
      form.values[field.name] = parsed == null || Number.isNaN(parsed) ? (text.trim() ? Number.NaN : null) : parsed;
    }
  }
}

function validate(api, fields) {
  const { t } = api;
  const errors = {};
  for (const field of fields) {
    if (!visibleWhen(field.when, form.values)) continue;
    const v = form.values[field.name];
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim());
    if (field.type === 'duration' && Number.isNaN(v)) errors[field.name] = t('form.badDuration');
    else if (field.required && empty && field.type !== 'checkbox') errors[field.name] = t('form.required');
  }
  form.errors = errors;
  return !Object.keys(errors).length;
}

function bind(api, getFields) {
  const { root, render, close, action, icon, t } = api;
  const fields = () => (api.fields ? api.fields() : getFields());
  const redraw = () => { collect(root, fields()); settle(fields(), form.values); render(); };
  const submit = () => {
    collect(root, fields());
    if (!validate(api, fields())) { render(); root.querySelector('.ff-field .invalid, .ff-field .ff-ref.invalid')?.focus(); return; }
    const out = {};
    for (const field of fields()) {
      if (!visibleWhen(field.when, form.values)) { out[field.name] = field.type === 'multiselect' ? [] : field.type === 'checkbox' ? false : null; continue; }
      let v = form.values[field.name];
      if (['text', 'textarea', undefined].includes(field.type) && typeof v === 'string') v = field.type === 'textarea' ? v.replace(/\s+$/, '') : v.trim();
      if (['select', 'user', 'date', 'icon'].includes(field.type) && v === '') v = null;
      out[field.name] = v;
    }
    close({ values: out });
  };
  root.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.ff) { form.values[el.dataset.ff] = el.value; if (form.errors[el.dataset.ff]) { delete form.errors[el.dataset.ff]; el.classList.remove('invalid'); } }
    if (el.dataset.ffDuration) {
      form.durationText = { ...form.durationText, [el.dataset.ffDuration]: el.value };
      const parsed = parseDuration(el.value);
      el.classList.toggle('invalid', Boolean(el.value.trim()) && Number.isNaN(parsed));
      const note = el.parentElement.querySelector('small');
      const text = !el.value.trim() ? '' : Number.isNaN(parsed) ? t('form.badDuration') : `= ${formatDuration(parsed, api.L())}`;
      if (note) { note.textContent = text; note.className = Number.isNaN(parsed) ? 'danger-text' : 'muted ff-duration-note'; } else if (text) el.insertAdjacentHTML('afterend', `<small class="${Number.isNaN(parsed) ? 'danger-text' : 'muted ff-duration-note'}">${api.escapeHtml(text)}</small>`);
    }
  });
  root.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.ffCheck) { form.values[el.dataset.ffCheck] = el.checked; redraw(); }
    if (el.dataset.ffColorCustom) { form.values[el.dataset.ffColorCustom] = el.value; redraw(); }
    if (el.dataset.ff && el.type === 'date') form.values[el.dataset.ff] = el.value;
  });
  root.addEventListener('click', (event) => {
    const submitButton = event.target.closest('[data-action="form-submit"]');
    if (submitButton) { event.preventDefault(); submit(); return; }
    const refButton = event.target.closest('[data-ref-dd]');
    if (refButton && root.contains(refButton)) {
      const field = fields().find((f) => f.name === refButton.dataset.refDd);
      if (!field) return;
      collect(root, fields());
      const multi = field.type === 'multiselect';
      const items = optionsOf(field, form.values).map((o) => ({ ...o, glyph: o.glyph ?? (field.type === 'user' ? 'user' : undefined) }));
      if (!field.required && !multi) items.unshift({ value: '', label: field.noneLabel ?? t('form.none'), glyph: field.type === 'user' ? undefined : 'close', html: field.type === 'user' ? '<span class="mb-avatar-none" style="width:16px;height:16px"></span>' : undefined });
      if (multi) for (const v of form.values[field.name]) if (!items.some((o) => String(o.value) === String(v))) items.push({ value: v, label: v, glyph: 'tag' });
      openRefList(refButton, {
        items, multi, icon, value: form.values[field.name], values: multi ? form.values[field.name] : null,
        allowNew: Boolean(field.allowNew), newLabel: t('form.addNew'), emptyLabel: t('form.noMatches'), searchLabel: t('form.search'),
        onPick: (value, values) => {
          if (multi) { form.values[field.name] = values; delete form.errors[field.name]; return; }
          const option = items.find((o) => String(o.value) === String(value));
          form.values[field.name] = option ? option.value : value;
          delete form.errors[field.name];
          redraw();
          root.querySelector(`[data-ref-dd="${CSS.escape(field.name)}"]`)?.focus();
        },
        onClose: multi ? () => { redraw(); } : undefined,
      });
      return;
    }
    const clear = event.target.closest('[data-ff-clear]');
    if (clear) { form.values[clear.dataset.ffClear] = ''; redraw(); return; }
    const swatch = event.target.closest('[data-ff-color]');
    if (swatch) { form.values[swatch.dataset.ffColor] = swatch.dataset.value; redraw(); return; }
    const iconButton = event.target.closest('[data-ff-icon]');
    if (iconButton) {
      collect(root, fields());
      const field = fields().find((f) => f.name === iconButton.dataset.ffIcon);
      action('form-pick-icon', { name: field?.name, value: form.values[field?.name] ?? '', title: field?.label ?? '' });
    }
  });
  root.addEventListener('submit', (event) => { event.preventDefault(); submit(); });
  root.ownerDocument.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    if (!event.target.closest?.('.ff')) return;
    if (event.target.matches('textarea') && !(event.ctrlKey || event.metaKey)) return;
    if (event.target.matches('button')) return;
    if (event.target.matches('.stepper-value')) { event.target.dispatchEvent(new Event('change', { bubbles: true })); }
    event.preventDefault();
    submit();
  });
  api.onFormMessage = (message) => {
    if (message?.type === 'form-icon' && message.name && message.ref != null) { collect(root, fields()); form.values[message.name] = message.ref; redraw(); }
  };
  api.resetForm = () => { form = null; closeRefList({ focus: false }); };
}

/** For the host message listener in popup.js. */
export function formHostMessage(api, message) { api.onFormMessage?.(message); }
/** popup.js refresh(): the popup is opened again with new parameters. */
export function resetFormPopup(api) { form = null; api.resetForm?.(); }

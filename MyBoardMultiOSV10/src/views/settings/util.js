// Helpers of the project settings view: texts, small HTML builders (icon buttons, icon dropdowns, steppers,
// form rows), error texts by code, drag-to-reorder lists and the undo-able save.
import { t as translate, getLanguage } from '../../i18n.js';
import { icon } from '../../icons.js';
import { renderIconRef, normalizeColor } from '../../ui/iconref.js';
import { stepperHtml } from '../../stepper.js';
import { escapeHtml } from '../../ui/dom.js';

export { icon, renderIconRef, stepperHtml, getLanguage, normalizeColor };
export const esc = escapeHtml;

/** A text of this view ('ps.' + key). */
export const tr = (key, params) => translate(`ps.${key}`, params);
/** A text when it exists, else `fallback`. */
export const trOr = (key, fallback, params) => { const value = translate(`ps.${key}`, params, '\u0000'); return value === '\u0000' ? fallback : value; };

// ───────────────────────── HTML builders

/** A button with icon + label (`label` already translated). */
export function btn(action, label, glyph, { cls = '', attrs = '', disabled = false, title = '' } = {}) {
  return `<button type="button" class="button ps-btn ${cls}" data-act="${esc(action)}" ${attrs} ${disabled ? 'disabled' : ''} title="${esc(title || label)}">${icon(glyph)}<span>${esc(label)}</span></button>`;
}
/** An icon-only button (with tooltip). */
export function ibtn(action, title, glyph, { cls = '', attrs = '', disabled = false } = {}) {
  return `<button type="button" class="icon-button ps-ibtn ${cls}" data-act="${esc(action)}" ${attrs} ${disabled ? 'disabled' : ''} title="${esc(title)}" aria-label="${esc(title)}">${icon(glyph)}</button>`;
}

/**
 * A dropdown (the app turns every <select> into a list with icons): options [{ value, label, icon }].
 * `name` goes to data-field; `attrs` adds attributes.
 */
export function select(name, value, options, { disabled = false, attrs = '', cls = '', title = '', glyph = 'dot' } = {}) {
  const v = value == null ? '' : String(value);
  return `<select class="ps-select ${cls}" data-field="${esc(name)}" data-icon="${esc(glyph)}" ${attrs} ${disabled ? 'disabled' : ''} title="${esc(title)}" aria-label="${esc(title)}">${options.map((o) => (o.group
    ? `<optgroup label="${esc(o.group)}">${o.options.map((x) => option(x, v)).join('')}</optgroup>`
    : option(o, v))).join('')}</select>`;
}
const option = (o, v) => `<option value="${esc(o.value ?? '')}" data-icon="${esc(o.icon ?? 'dot')}" ${String(o.value ?? '') === v ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</option>`;

export function input(name, value, { type = 'text', disabled = false, attrs = '', cls = '', placeholder = '', title = '' } = {}) {
  return `<input class="ps-input ${cls}" type="${type}" data-field="${esc(name)}" value="${esc(value ?? '')}" ${disabled ? 'disabled' : ''} placeholder="${esc(placeholder)}" title="${esc(title || placeholder)}" aria-label="${esc(title || placeholder || name)}" ${attrs} spellcheck="false" />`;
}

export function textarea(name, value, { disabled = false, rows = 3, placeholder = '', attrs = '' } = {}) {
  return `<textarea class="ps-input ps-textarea" data-field="${esc(name)}" rows="${rows}" ${disabled ? 'disabled' : ''} placeholder="${esc(placeholder)}" aria-label="${esc(placeholder || name)}" ${attrs}>${esc(value ?? '')}</textarea>`;
}

export function checkbox(name, checked, label, { disabled = false, attrs = '' } = {}) {
  return `<label class="ps-check" title="${esc(label)}"><input type="checkbox" data-field="${esc(name)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${attrs} /><span>${esc(label)}</span></label>`;
}

/** A colour: swatch (native colour box) + hex text. */
export function colorInput(name, value, { disabled = false, attrs = '' } = {}) {
  const hex = normalizeColor(value) ?? '#888888';
  return `<span class="ps-color" ${attrs}><input type="color" data-field="${esc(name)}" value="${esc(hex)}" ${disabled ? 'disabled' : ''} title="${esc(tr('common.color'))}" aria-label="${esc(tr('common.color'))}" /></span>`;
}

/** The icon of an item as a button that opens the icon picker. */
export function iconButton(name, ref, { disabled = false, attrs = '', size = 20 } = {}) {
  return `<button type="button" class="ps-iconpick" data-act="pick-icon" data-field="${esc(name)}" ${attrs} ${disabled ? 'disabled' : ''} title="${esc(tr('common.changeIcon'))}" aria-label="${esc(tr('common.changeIcon'))}">${renderIconRef(ref, { size, fallback: 'b:dot' })}</button>`;
}

/** A labelled form row: [icon label] [control]. */
export function row(glyph, label, control, { hint = '', cls = '' } = {}) {
  return `<div class="ps-row ${cls}"><div class="ps-row-label">${icon(glyph)}<span>${esc(label)}</span></div><div class="ps-row-control">${control}${hint ? `<div class="ps-hint">${esc(hint)}</div>` : ''}</div></div>`;
}

/** A stepper with its own data-key. */
export function stepper(key, value, { min = 0, max = 999, step = 1, unit = '', label = '', disabled = false } = {}) {
  return stepperHtml({ key, value: value ?? 0, min, max, step, unit, label, disabled, decreaseTip: `${label} −`, increaseTip: `${label} +` });
}

export function card(title, glyph, body, { cls = '', actions = '', attrs = '' } = {}) {
  return `<section class="ps-card ${cls}" ${attrs}><header class="ps-card-head">${icon(glyph)}<h3>${esc(title)}</h3><span class="grow"></span>${actions}</header><div class="ps-card-body">${body}</div></section>`;
}

export const note = (text, kind = 'info') => `<div class="ps-note ${kind}">${icon(kind === 'warning' ? 'warning' : kind === 'danger' ? 'error' : 'info')}<span>${esc(text)}</span></div>`;

export const empty = (text, glyph = 'info') => `<div class="ps-empty">${icon(glyph)}<span>${esc(text)}</span></div>`;

export const grip = (title) => `<span class="ps-grip" draggable="true" title="${esc(title || tr('common.dragToReorder'))}" aria-label="${esc(title || tr('common.dragToReorder'))}" tabindex="0">${icon('grip')}</span>`;

// ───────────────────────── errors

const KNOWN = new Set();
/** A translated message for an API error (by code), with the server message as detail when it adds something. */
export function errorText(error) {
  const code = String(error?.code ?? 'error');
  const direct = trOr(`err.${code}`, null, { count: error?.details?.count ?? '', field: error?.details?.field ?? '' });
  if (direct) return direct;
  if (/^JQL_/.test(code)) return `${tr('err.JQL')}: ${error.message ?? ''}`;
  if (/^INVALID_/.test(code)) return `${tr('err.INVALID')} (${code})${error.message ? `: ${error.message}` : ''}`;
  if (/^VALIDATOR_|^CONDITION_/.test(code)) return `${tr('err.RULE')}: ${error.message ?? code}`;
  if (/_NOT_FOUND$/.test(code)) return tr('err.NOT_FOUND');
  KNOWN.add(code);
  return error?.message ? String(error.message) : code;
}

// ───────────────────────── drag to reorder (HTML5 drag and drop, rows marked [data-id] inside `list`)

/**
 * Lets the rows of `list` (children with data-id and a .ps-grip) be reordered by dragging the grip, or with
 * Alt+↑/↓ on the grip. `onOrder(ids)` gets the new order.
 */
export function sortable(list, onOrder, { rowSelector = '[data-id]', disabled = false } = {}) {
  if (!list || disabled) return;
  let dragged = null;
  list.addEventListener('dragstart', (event) => {
    const handle = event.target.closest?.('.ps-grip');
    const rowEl = handle?.closest(rowSelector);
    if (!rowEl || !list.contains(rowEl)) return;
    dragged = rowEl;
    rowEl.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/x-ps-row', rowEl.dataset.id); event.dataTransfer.setDragImage(rowEl, 12, 12); } catch { /* synthetic */ }
  });
  list.addEventListener('dragover', (event) => {
    if (!dragged) return;
    const over = event.target.closest?.(rowSelector);
    if (!over || over === dragged || over.parentElement !== dragged.parentElement) return;
    event.preventDefault();
    const r = over.getBoundingClientRect();
    const horizontal = getComputedStyle(over.parentElement).flexDirection === 'row';
    const after = horizontal ? event.clientX > r.left + r.width / 2 : event.clientY > r.top + r.height / 2;
    over.parentElement.insertBefore(dragged, after ? over.nextSibling : over);
  });
  list.addEventListener('drop', (event) => { if (dragged) event.preventDefault(); });
  list.addEventListener('dragend', () => {
    if (!dragged) return;
    const parent = dragged.parentElement;
    dragged.classList.remove('dragging');
    dragged = null;
    onOrder([...parent.children].filter((el) => el.matches(rowSelector)).map((el) => el.dataset.id));
  });
  list.addEventListener('keydown', (event) => {
    const handle = event.target.closest?.('.ps-grip');
    if (!handle || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const rowEl = handle.closest(rowSelector);
    const sibling = event.key === 'ArrowUp' ? rowEl.previousElementSibling : rowEl.nextElementSibling;
    if (!sibling?.matches(rowSelector)) return;
    rowEl.parentElement.insertBefore(rowEl, event.key === 'ArrowUp' ? sibling : sibling.nextSibling);
    onOrder([...rowEl.parentElement.children].filter((el) => el.matches(rowSelector)).map((el) => el.dataset.id));
  });
}

/** Moves `id` from its place to `to` in a copy of `ids`. */
export const moveId = (ids, id, to) => { const out = ids.filter((x) => x !== id); out.splice(Math.max(0, Math.min(out.length, to)), 0, id); return out; };

export const items = (value) => (Array.isArray(value) ? value : value?.items ?? []);

export const debounce = (fn, ms = 300) => { let timer = null; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; };

/** 'YYYY-MM-DD HH:MM' of epoch ms in local time. */
export function dateTime(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Built-in user glyph for dropdowns; users' own avatars are drawn in tables. */
export const userOptions = (users, { none = null, extra = [] } = {}) => [
  ...(none ? [{ value: '', label: none, icon: 'close' }] : []),
  ...extra,
  ...users.map((u) => ({ value: u.id ?? u.userId, label: u.displayName ?? u.display_name ?? u.username, icon: 'user' })),
];

export const CATEGORY_ICON = { todo: 'list', inprogress: 'play', done: 'check' };
export const LEVEL_ICON = { '-1': 'layers', 0: 'file', 1: 'list' };
export const ROLE_ICON = { viewer: 'eye', member: 'edit', admin: 'key' };

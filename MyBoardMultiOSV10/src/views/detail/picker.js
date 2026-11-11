// The detail view's drop-down list: every item has an icon (an IconRef, an avatar or an app icon), the
// chosen ones a check mark; optional search box, multi-select (stays open, toggles) and "create" entry.
// Looks like the app's own icon dropdowns (ui/dropdown.js: .dd-list / .dd-item) — no native <select>.
import { icon } from '../../icons.js';
import { t } from '../../i18n.js';
import { esc } from './util.js';

let current = null;
/** The value of the "create" entry (a NUL would not survive the HTML parser). */
export const CREATE = ':create:';

export const pickerOpen = () => Boolean(current);
export const pickerFor = () => current?.key ?? null;

export function closePicker({ focus = false } = {}) {
  if (!current) return;
  const { el, anchor, onClose, cleanup } = current;
  current = null;
  cleanup();
  el.remove();
  anchor?.setAttribute?.('aria-expanded', 'false');
  onClose?.();
  if (focus && anchor?.isConnected) anchor.focus({ preventScroll: true });
}

/**
 * anchor: the element the list opens under. options:
 *   key            what the list edits (tests and re-anchoring after a redraw)
 *   items          [{ value, label, iconHtml?, icon?, hint?, group?, disabled?, danger? }]
 *   value          the chosen value (single) / values (multi: array)
 *   multi          toggles values; onPick(values) after each toggle, stays open
 *   search         shows a search box (default: more than 8 items)
 *   create         (text) → label of a "create" entry shown when the text is new; onCreate(text)
 *   onPick(value)  single: the chosen value (the list closes first)
 *   placeholder    of the search box
 */
export function openPicker(anchor, options) {
  closePicker();
  const doc = anchor.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'dd-list dt-picker';
  el.setAttribute('role', 'listbox');
  el.dataset.pickerKey = options.key ?? '';
  const multi = Boolean(options.multi);
  let chosen = multi ? new Set(options.value ?? []) : options.value ?? null;
  const showSearch = options.search ?? (options.items.length > 8 || Boolean(options.create));
  el.innerHTML = `${showSearch ? `<div class="dt-picker-search">${icon('search')}<input type="text" class="dt-picker-input" placeholder="${esc(options.placeholder ?? t('detail.search'))}" autocomplete="off" spellcheck="false" /></div>` : ''}<div class="dt-picker-items"></div>`;
  doc.body.append(el);
  const input = el.querySelector('.dt-picker-input');
  const list = el.querySelector('.dt-picker-items');
  let active = -1;
  let rows = [];

  const isChosen = (value) => (multi ? chosen.has(value) : value === chosen);
  function draw() {
    const query = (input?.value ?? '').trim().toLowerCase();
    const items = options.items.filter((item) => item.group || !query || `${item.label} ${item.value} ${item.hint ?? ''}`.toLowerCase().includes(query));
    rows = items.filter((item, i) => !item.group || (items[i + 1] && !items[i + 1].group));
    const text = (input?.value ?? '').trim();
    const createLabel = options.create && text && !options.items.some((item) => !item.group && String(item.label).toLowerCase() === text.toLowerCase()) ? options.create(text) : null;
    if (createLabel) rows.push({ value: CREATE, label: createLabel, icon: 'plus', create: text });
    const selectable = rows.filter((row) => !row.group && !row.disabled);
    active = Math.min(Math.max(active, selectable.length ? 0 : -1), selectable.length - 1);
    if (query && active < 0 && selectable.length) active = 0;
    list.innerHTML = rows.length
      ? rows.map((row) => (row.group
        ? `<div class="dd-group" role="presentation">${esc(row.group)}</div>`
        : `<div class="dd-item dt-pick${isChosen(row.value) ? ' chosen' : ''}${row.disabled ? ' disabled' : ''}${row.danger ? ' danger' : ''}" role="option" aria-selected="${isChosen(row.value)}" data-value="${esc(row.value)}" title="${esc(row.hint ? `${row.label} — ${row.hint}` : row.label)}">${row.iconHtml ?? icon(row.icon ?? 'dot')}<span>${esc(row.label)}${row.hint ? `<small>${esc(row.hint)}</small>` : ''}</span>${isChosen(row.value) ? icon('check', 'icon dd-check') : '<i></i>'}</div>`)).join('')
      : `<div class="dt-picker-empty">${icon('info')}<span>${esc(t('detail.noMatches'))}</span></div>`;
    markActive(false);
  }
  function markActive(scroll = true) {
    const items = [...list.querySelectorAll('.dd-item:not(.disabled)')];
    items.forEach((item, i) => item.classList.toggle('active', i === active));
    if (scroll) items[active]?.scrollIntoView({ block: 'nearest' });
  }
  function place() {
    const r = anchor.getBoundingClientRect();
    const view = doc.defaultView;
    const below = view.innerHeight - r.bottom - 6;
    const above = r.top - 6;
    el.style.minWidth = `${Math.max(200, Math.round(r.width))}px`;
    const up = below < 260 && above > below;
    el.style.maxHeight = `${Math.max(140, Math.min(380, up ? above : below))}px`;
    const width = el.getBoundingClientRect().width;
    el.style.left = `${Math.max(4, Math.min(r.left, view.innerWidth - width - 4))}px`;
    if (up) { el.style.top = ''; el.style.bottom = `${Math.round(view.innerHeight - r.top + 2)}px`; } else { el.style.bottom = ''; el.style.top = `${Math.round(r.bottom + 2)}px`; }
  }
  function pick(rowEl) {
    if (!rowEl || rowEl.classList.contains('disabled')) return;
    const value = rowEl.dataset.value;
    const row = rows.find((r) => !r.group && String(r.value) === value);
    if (row?.create != null) { options.onCreate?.(row.create); closePicker(); return; }
    if (multi) {
      if (chosen.has(row.value)) chosen.delete(row.value); else chosen.add(row.value);
      draw();
      options.onPick?.([...chosen]);
      return;
    }
    closePicker({ focus: true });
    options.onPick?.(row ? row.value : value);
  }

  el.addEventListener('pointerdown', (event) => { if (!event.target.closest('input')) event.preventDefault(); });
  el.addEventListener('click', (event) => pick(event.target.closest('.dd-item')));
  el.addEventListener('pointermove', (event) => {
    const item = event.target.closest('.dd-item:not(.disabled)');
    if (!item) return;
    active = [...list.querySelectorAll('.dd-item:not(.disabled)')].indexOf(item);
    markActive(false);
  });
  const onKey = (event) => {
    if (!current || current.el !== el) return;
    const items = [...list.querySelectorAll('.dd-item:not(.disabled)')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, Math.min(items.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      markActive();
    } else if (event.key === 'Enter') {
      if (items[active]) { event.preventDefault(); event.stopPropagation(); pick(items[active]); }
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closePicker({ focus: true });
    } else if (event.key === 'Tab') closePicker();
  };
  const onDown = (event) => { if (!el.contains(event.target) && !anchor.contains(event.target)) closePicker(); };
  const onScroll = (event) => { if (!el.contains(event.target)) closePicker(); };
  const onResize = () => closePicker();
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('scroll', onScroll, true);
  doc.defaultView.addEventListener('resize', onResize);
  input?.addEventListener('input', () => { active = 0; draw(); place(); });

  current = {
    el, anchor, key: options.key ?? '', onClose: options.onClose,
    cleanup: () => {
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('scroll', onScroll, true);
      doc.defaultView.removeEventListener('resize', onResize);
    },
  };
  anchor.setAttribute('aria-expanded', 'true');
  if (!multi) { const at = rows.filter((r) => !r.group && !r.disabled).findIndex((r) => r.value === chosen); active = at; }
  draw();
  if (!multi) { const at = rows.filter((r) => !r.group && !r.disabled).findIndex((r) => r.value === chosen); active = at; }
  if (options.keepFocus && active < 0) active = 0;
  markActive();
  place();
  if (!options.keepFocus) (input ?? el).focus?.({ preventScroll: true });
  return el;
}

/** After a redraw of the panel the anchor element is new: the list follows it, or closes. */
export function reanchorPicker(root) {
  if (!current) return;
  if (current.anchor.isConnected) return;
  const next = current.key ? root.querySelector(`[data-picker-anchor="${CSS.escape(current.key)}"]`) : null;
  if (next) { current.anchor = next; next.setAttribute('aria-expanded', 'true'); } else closePicker();
}

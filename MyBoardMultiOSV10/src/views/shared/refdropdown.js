// A dropdown whose items carry an IconRef (types, priorities, users' avatars, epics) or an app icon — what
// ui/dropdown.js does for a <select>, for lists a <select> cannot draw. Single or multiple choice, with a
// search box for long lists. Works in any window (main window, popup windows): the list goes into the
// owner's document.
//
//   refButtonHtml({ id, items, value, placeholder, glyph, title, icon })  → the closed button (icon + label + ▾)
//   openRefList(owner, { items, value | values, multi, search, onPick(value, values), onClose, icon, allowNew, newLabel })
//   closeRefList()
//
// item: { value, label, iconRef?, glyph? (app icon name), hint?, group? (a heading row), disabled? }
import { renderIconRef } from '../../ui/iconref.js';
import { escapeHtml } from './format.js';

let open = null;

const itemIcon = (item, icon) => (item.iconRef ? renderIconRef(item.iconRef, { size: 16 }) : item.html ? item.html : icon(item.glyph || 'dot'));

/** The button that shows the chosen item(s). `value` may be an array (multi). */
export function refButtonHtml({ id, items = [], value = null, placeholder = '', glyph = 'chevronDown', title = '', icon, extraClass = '', disabled = false }) {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const chosen = values.map((v) => items.find((item) => !item.group && String(item.value) === String(v))).filter(Boolean);
  let face;
  if (!chosen.length) face = `<span class="mb-refbutton-text muted">${escapeHtml(placeholder)}</span>`;
  else if (Array.isArray(value)) face = `<span class="mb-refbutton-chips">${chosen.map((item) => `<span class="mb-refchip">${itemIcon(item, icon)}<span>${escapeHtml(item.label)}</span></span>`).join('')}</span>`;
  else face = `${itemIcon(chosen[0], icon)}<span class="mb-refbutton-text">${escapeHtml(chosen[0].label)}</span>`;
  const tip = title || chosen.map((item) => item.label).join(', ') || placeholder;
  return `<button type="button" class="mb-refbutton ${extraClass}" data-ref-dd="${escapeHtml(id)}" aria-haspopup="listbox" aria-expanded="false" title="${escapeHtml(tip)}" ${disabled ? 'disabled' : ''}>${face}<span class="mb-refbutton-caret">${icon(glyph)}</span></button>`;
}

export function closeRefList({ focus = true } = {}) {
  if (!open) return;
  const { el, owner, onClose } = open;
  open = null;
  el.remove();
  owner.setAttribute('aria-expanded', 'false');
  owner.ownerDocument.removeEventListener('pointerdown', outside, true);
  owner.ownerDocument.removeEventListener('keydown', onKey, true);
  if (focus) owner.focus({ preventScroll: true });
  onClose?.();
}

export const refListOpen = () => Boolean(open);

function outside(event) {
  if (!open) return;
  if (open.el.contains(event.target) || open.owner.contains(event.target)) return;
  closeRefList({ focus: false });
}

function onKey(event) {
  if (!open) return;
  const rows = [...open.el.querySelectorAll('.dd-item:not(.disabled)')];
  const at = rows.indexOf(open.active);
  const go = (i) => { event.preventDefault(); setActive(rows[Math.max(0, Math.min(rows.length - 1, i))]); };
  switch (event.key) {
    case 'ArrowDown': go(at < 0 ? 0 : at + 1); break;
    case 'ArrowUp': go(at < 0 ? rows.length - 1 : at - 1); break;
    case 'PageDown': go(at + 8); break;
    case 'PageUp': go(at - 8); break;
    case 'Enter':
      event.preventDefault(); event.stopPropagation();
      if (open.active?.dataset.new) choose(open.query.trim(), true);
      else if (open.active) choose(open.active.dataset.value);
      else if (open.allowNew && open.query.trim()) choose(open.query.trim(), true);
      break;
    case 'Escape': event.preventDefault(); event.stopPropagation(); closeRefList(); break;
    case 'Tab': closeRefList({ focus: false }); break;
    default: break;
  }
}

function setActive(row) {
  open?.active?.classList.remove('active');
  if (!open) return;
  open.active = row ?? null;
  row?.classList.add('active');
  row?.scrollIntoView({ block: 'nearest' });
}

function choose(value, isNew = false) {
  if (!open) return;
  const { multi, onPick } = open;
  if (!multi) {
    const pick = onPick;
    closeRefList();
    pick?.(value, [value]);
    return;
  }
  const values = new Set(open.values);
  if (values.has(value) && !isNew) values.delete(value); else values.add(value);
  open.values = [...values];
  if (isNew && !open.items.some((item) => item.value === value)) open.items = [...open.items, { value, label: value, glyph: 'tag' }];
  onPick?.(value, open.values);
  open.query = '';
  draw();
}

function draw() {
  const { el, items, values, multi, icon, search } = open;
  const query = open.query.trim().toLowerCase();
  const shown = query ? items.filter((item) => item.group || `${item.label} ${item.value} ${item.hint ?? ''}`.toLowerCase().includes(query)) : items;
  const rows = shown.filter((item, i) => !item.group || (shown[i + 1] && !shown[i + 1].group));
  const chosen = new Set(values.map(String));
  const list = rows.map((item) => (item.group
    ? `<div class="dd-group" role="presentation">${escapeHtml(item.group)}</div>`
    : `<div class="dd-item ${chosen.has(String(item.value)) ? 'chosen' : ''} ${item.disabled ? 'disabled' : ''}" role="option" aria-selected="${chosen.has(String(item.value))}" data-value="${escapeHtml(item.value)}" title="${escapeHtml(item.hint ? `${item.label} — ${item.hint}` : item.label)}">${itemIcon(item, icon)}<span>${escapeHtml(item.label)}${item.hint ? ` <small class="muted">${escapeHtml(item.hint)}</small>` : ''}</span>${chosen.has(String(item.value)) ? icon('check', 'icon dd-check') : multi ? '<span></span>' : ''}</div>`)).join('');
  const newRow = open.allowNew && query && !items.some((item) => String(item.label).toLowerCase() === query) ? `<div class="dd-item mb-reflist-new" data-new="1" role="option" title="${escapeHtml(open.newLabel)}">${icon('plus')}<span>${escapeHtml(open.newLabel)}: <b>${escapeHtml(open.query.trim())}</b></span><span></span></div>` : '';
  const body = el.querySelector('.mb-reflist-items');
  body.innerHTML = list + newRow || `<div class="mb-reflist-empty muted">${escapeHtml(open.emptyLabel)}</div>`;
  if (search) el.querySelector('.mb-reflist-search').hidden = false;
  open.active = null;
  setActive(body.querySelector('.dd-item.chosen:not(.disabled)') && !query ? body.querySelector('.dd-item.chosen:not(.disabled)') : query ? body.querySelector('.dd-item:not(.disabled)') : null);
}

/** Opens the list under (or above) `owner`. */
export function openRefList(owner, { items = [], value = null, values = null, multi = false, search = 'auto', onPick, onClose, icon, allowNew = false, newLabel = '+', emptyLabel = '—', searchLabel = '' }) {
  const reopen = open?.owner === owner;
  closeRefList({ focus: false });
  if (reopen) return;
  const doc = owner.ownerDocument;
  const view = doc.defaultView;
  const el = doc.createElement('div');
  el.className = 'dd-list mb-reflist';
  el.setAttribute('role', 'listbox');
  if (multi) el.setAttribute('aria-multiselectable', 'true');
  const withSearch = search === true || allowNew || (search === 'auto' && items.filter((item) => !item.group).length > 9);
  el.innerHTML = `<div class="mb-reflist-search" ${withSearch ? '' : 'hidden'}>${icon('search')}<input type="text" aria-label="${escapeHtml(searchLabel)}" placeholder="${escapeHtml(searchLabel)}" /></div><div class="mb-reflist-items"></div>`;
  doc.body.append(el);
  open = { el, owner, items, values: multi ? [...(values ?? [])] : value == null ? [] : [value], multi, onPick, onClose, icon, query: '', active: null, search: withSearch, allowNew, newLabel, emptyLabel };
  draw();
  const r = owner.getBoundingClientRect();
  const below = view.innerHeight - r.bottom - 6;
  const above = r.top - 6;
  const natural = Math.min(el.scrollHeight, 360);
  const up = below < natural && above > below;
  el.style.maxHeight = `${Math.max(100, Math.min(360, up ? above : below))}px`;
  el.style.minWidth = `${Math.max(180, Math.round(r.width))}px`;
  const width = el.getBoundingClientRect().width;
  el.style.left = `${Math.max(4, Math.min(r.left, view.innerWidth - width - 4))}px`;
  if (up) el.style.bottom = `${Math.round(view.innerHeight - r.top + 2)}px`; else el.style.top = `${Math.round(r.bottom + 2)}px`;
  owner.setAttribute('aria-expanded', 'true');
  el.addEventListener('pointerdown', (event) => { if (!event.target.closest('input')) event.preventDefault(); });
  el.addEventListener('click', (event) => {
    const row = event.target.closest('.dd-item');
    if (!row || row.classList.contains('disabled')) return;
    if (row.dataset.new) choose(open.query.trim(), true); else choose(row.dataset.value);
  });
  el.addEventListener('pointermove', (event) => { const row = event.target.closest('.dd-item:not(.disabled)'); if (row && row !== open?.active) { open.active?.classList.remove('active'); open.active = row; row.classList.add('active'); } });
  const input = el.querySelector('.mb-reflist-search input');
  input.addEventListener('input', () => { if (!open) return; open.query = input.value; draw(); });
  doc.addEventListener('pointerdown', outside, true);
  doc.addEventListener('keydown', onKey, true);
  if (withSearch) input.focus(); else owner.focus({ preventScroll: true });
}

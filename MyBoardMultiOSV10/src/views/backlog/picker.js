// A drop-down list with icons (and check boxes for a multi choice), opened under a button.
// Used by the backlog and reports views instead of native <select>: options carry IconRef pictures
// (issue types, priorities, avatars) the shell's <select> dropdown cannot draw.
//
//   openPicker(anchor, { items: [{ value, label, icon (HTML), detail?, group?, disabled?, separator? }],
//                        multi?, value | values, search?, onPick(value | values, item), onClose? })
//   → { close() }
//
// Keys: ↑ ↓ Home End move, Enter / Space pick, Esc closes, typing goes to the search box (long lists).
import { icon } from '../../icons.js';
import { escapeHtml } from '../../ui/dom.js';
import { L } from './texts.js';

let current = null;

export function closePicker() {
  if (!current) return;
  const { el, anchor, onClose, cleanup } = current;
  current = null;
  cleanup();
  el.remove();
  anchor?.setAttribute?.('aria-expanded', 'false');
  onClose?.();
}

export const pickerOpenFor = (anchor) => Boolean(current && current.anchor === anchor);

export function openPicker(anchor, options) {
  if (current?.anchor === anchor) { closePicker(); return null; }
  closePicker();
  const { items = [], multi = false, search = items.length > 10, onPick, onClose, width = 0, title = '' } = options;
  const chosen = new Set(multi ? options.values ?? [] : [options.value]);
  const doc = anchor.ownerDocument;
  const el = doc.createElement('div');
  el.className = `mbv-pop ${multi ? 'multi' : ''}`;
  el.setAttribute('role', 'listbox');
  if (multi) el.setAttribute('aria-multiselectable', 'true');
  let query = '';
  let active = -1;

  const visible = () => items.filter((item) => item.separator || item.group || !query || `${item.label} ${item.detail ?? ''} ${item.value}`.toLowerCase().includes(query));
  const draw = () => {
    const shown = visible().filter((item, i, all) => !(item.group && (!all[i + 1] || all[i + 1].group || all[i + 1].separator)));
    const rows = shown.map((item) => {
      if (item.separator) return '<div class="mbv-pop-sep" role="separator"></div>';
      if (item.group) return `<div class="mbv-pop-group" role="presentation">${escapeHtml(item.group)}</div>`;
      const on = chosen.has(item.value);
      const box = multi && !item.action ? `<span class="mbv-check ${on ? 'on' : ''}">${on ? icon('check') : ''}</span>` : '';
      return `<div class="mbv-pop-item ${on && !multi ? 'chosen' : ''} ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}" role="option" aria-selected="${on}" data-value="${escapeHtml(item.value)}" title="${escapeHtml(item.tip ?? item.label)}">${box}<span class="mbv-pop-icon">${item.icon ?? ''}</span><span class="mbv-pop-label">${escapeHtml(item.label)}</span>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}${on && !multi ? icon('check', 'icon mbv-pop-tick') : ''}</div>`;
    }).join('');
    el.querySelector('.mbv-pop-list').innerHTML = rows || `<div class="mbv-pop-empty">${escapeHtml(L('noMatch'))}</div>`;
    setActive(active);
  };
  const itemsEls = () => [...el.querySelectorAll('.mbv-pop-item:not(.disabled)')];
  function setActive(i) {
    const list = itemsEls();
    for (const node of list) node.classList.remove('active');
    if (!list.length) { active = -1; return; }
    active = Math.max(0, Math.min(list.length - 1, i));
    if (i < 0) { active = -1; return; }
    list[active].classList.add('active');
    list[active].scrollIntoView({ block: 'nearest' });
  }
  const pick = (node) => {
    if (!node || node.classList.contains('disabled')) return;
    const item = items.find((x) => String(x.value) === node.dataset.value);
    if (!item) return;
    if (multi && !item.action) {
      if (chosen.has(item.value)) chosen.delete(item.value); else chosen.add(item.value);
      draw();
      onPick?.([...chosen], item);
      return;
    }
    closePicker();
    onPick?.(item.value, item);
  };

  el.innerHTML = `${title ? `<div class="mbv-pop-title">${escapeHtml(title)}</div>` : ''}${search ? `<label class="mbv-pop-search">${icon('search')}<input type="search" placeholder="${escapeHtml(L('searchList'))}" aria-label="${escapeHtml(L('searchList'))}" /></label>` : ''}<div class="mbv-pop-list"></div>`;
  doc.body.append(el);
  draw();
  // Under the button (or above it when there is more room there), inside the window.
  const view = doc.defaultView;
  const r = anchor.getBoundingClientRect();
  el.style.minWidth = `${Math.max(width, Math.round(r.width), 180)}px`;
  const below = view.innerHeight - r.bottom - 8;
  const above = r.top - 8;
  const up = below < Math.min(el.scrollHeight, 260) && above > below;
  el.style.maxHeight = `${Math.max(140, Math.min(440, up ? above : below))}px`;
  const w = el.getBoundingClientRect().width;
  el.style.left = `${Math.max(4, Math.min(r.left, view.innerWidth - w - 4))}px`;
  if (up) el.style.bottom = `${Math.round(view.innerHeight - r.top + 2)}px`; else el.style.top = `${Math.round(r.bottom + 2)}px`;
  anchor.setAttribute('aria-expanded', 'true');

  const input = el.querySelector('.mbv-pop-search input');
  input?.addEventListener('input', () => { query = input.value.trim().toLowerCase(); active = 0; draw(); });
  el.addEventListener('pointerdown', (event) => { if (!event.target.closest('input')) event.preventDefault(); });
  el.addEventListener('click', (event) => pick(event.target.closest('.mbv-pop-item')));
  el.addEventListener('pointermove', (event) => { const node = event.target.closest('.mbv-pop-item:not(.disabled)'); if (node) { const i = itemsEls().indexOf(node); if (i !== active) setActive(i); } });
  const onKey = (event) => {
    if (!current || current.el !== el) return;
    const list = itemsEls();
    const go = (i) => { event.preventDefault(); event.stopPropagation(); setActive(i); };
    switch (event.key) {
      case 'ArrowDown': return go(active < 0 ? 0 : active + 1);
      case 'ArrowUp': return go(active < 0 ? list.length - 1 : active - 1);
      case 'Home': if (event.target === input) return undefined; return go(0);
      case 'End': if (event.target === input) return undefined; return go(list.length - 1);
      case 'Enter': event.preventDefault(); event.stopPropagation(); return pick(list[active] ?? (list.length === 1 ? list[0] : null));
      case ' ': if (event.target === input) return undefined; event.preventDefault(); event.stopPropagation(); return pick(list[active]);
      case 'Escape': event.preventDefault(); event.stopPropagation(); closePicker(); anchor.focus?.(); return undefined;
      case 'Tab': closePicker(); return undefined;
      default:
        if (input && event.target !== input && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) input.focus();
        return undefined;
    }
  };
  const onDown = (event) => { if (!el.contains(event.target) && !anchor.contains(event.target)) closePicker(); };
  const onScroll = (event) => { if (!el.contains(event.target)) closePicker(); };
  const onResize = () => closePicker();
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('scroll', onScroll, true);
  view.addEventListener('resize', onResize);
  current = {
    el, anchor, onClose,
    cleanup: () => {
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('scroll', onScroll, true);
      view.removeEventListener('resize', onResize);
    },
  };
  if (input) input.focus(); else { setActive(Math.max(0, itemsEls().findIndex((n) => n.getAttribute('aria-selected') === 'true'))); el.tabIndex = -1; el.focus({ preventScroll: true }); }
  return { close: closePicker, el };
}

/** A button that opens a picker: icon + label + ▾ (the label shows the current choice). */
export function dropButtonHtml({ id, iconHtml = '', label = '', tip = '', cls = '', badge = '' }) {
  return `<button type="button" class="mbv-drop ${cls}" data-drop="${escapeHtml(id)}" aria-haspopup="listbox" aria-expanded="false" title="${escapeHtml(tip || label)}">${iconHtml}<span class="mbv-drop-label">${escapeHtml(label)}</span>${badge ? `<i class="mbv-count">${escapeHtml(badge)}</i>` : ''}${icon('chevronDown', 'icon mbv-caret')}</button>`;
}

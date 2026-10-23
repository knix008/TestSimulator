// Dropdowns with icons, in every window (main, popups, document viewer; installed from main.js).
//
// A native <select> list and a <datalist> suggestion list cannot show icons, so both are replaced by one list
// of our own: every item has an icon and the chosen one a check mark. The <select> itself stays where it is
// (its layout, value, keyboard stepping, the `change` event and the tests stay as they were); pressing it opens
// our list instead of the native one, and the chosen option's icon is drawn inside it. An <input list="…">
// keeps its text box and gets the same list, filtered by what is typed, instead of the browser's suggestions.
//
// An option's icon, first match: <option data-icon>, the icon of a model type named by the value (UMLClass),
// an icon named after the value with the select's data-icon-prefix (line + Curve → lineCurve) or as it is,
// the select's or the list's data-icon, a dot.
import { hasIcon, icon } from '../icons.js';
import { typeDef } from '../domain/meta.js';

const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Icons for common option values that no icon is named after. */
const VALUE_ICONS = {
  none: 'stereoNone', auto: 'sparkles', default: 'lineDefault', left: 'alignLeft', right: 'alignRight', center: 'alignCenter', centre: 'alignCenter',
  top: 'alignTop', middle: 'alignMiddle', bottom: 'alignBottom', down: 'arrowDown', up: 'arrowUp', light: 'sun', dark: 'moon', system: 'sun',
  ko: 'globe', en: 'globe', public: 'visibility', private: 'lock', protected: 'visibility', package: 'umlPackage', in: 'arrowEnd', out: 'arrowStart',
  inout: 'routeStraight', return: 'reverse', true: 'check', false: 'close', yes: 'check', no: 'close', high: 'flag', medium: 'flag', low: 'flag',
};

export function optionIcon(holder, option) {
  const value = option?.value ?? '';
  const prefix = holder?.dataset?.iconPrefix ?? '';
  const candidates = [
    option?.dataset?.icon,
    typeDef(value)?.icon,
    prefix && `${prefix}${cap(value)}`,
    !prefix && value,
    VALUE_ICONS[String(value).toLowerCase()],
    holder?.dataset?.icon,
  ];
  return candidates.find((name) => name && hasIcon(name)) ?? 'dot';
}

/** The icon as a CSS background (the closed select shows the chosen option's icon), in the select's colour. */
function iconUrl(name, color) {
  const svg = icon(name).replace('<svg class="icon"', '<svg xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/g, color);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

let openList = null;

function close({ focus = true } = {}) {
  if (!openList) return;
  const { el, owner } = openList;
  el.remove();
  owner.setAttribute('aria-expanded', 'false');
  openList = null;
  if (focus) owner.focus({ preventScroll: true });
}

/** Opens the list under (or above) `owner`: items [{ value, label, icon, disabled, group, style }], `current` value. */
function open(owner, items, current, choose, { filterText = '' } = {}) {
  close({ focus: false });
  const doc = owner.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'dd-list';
  el.setAttribute('role', 'listbox');
  el.dataset.ddFor = owner.dataset.ddId;
  const query = filterText.trim().toLowerCase();
  const shown = query ? items.filter((item) => item.group || `${item.label} ${item.value}`.toLowerCase().includes(query)) : items;
  const rows = shown.filter((item, i) => !item.group || (shown[i + 1] && !shown[i + 1].group));
  if (!rows.some((item) => !item.group)) return;
  el.innerHTML = rows.map((item) => (item.group
    ? `<div class="dd-group" role="presentation">${esc(item.group)}</div>`
    : `<div class="dd-item ${item.value === current ? 'chosen' : ''} ${item.disabled ? 'disabled' : ''}" role="option" aria-selected="${item.value === current}" data-value="${esc(item.value)}" title="${esc(item.label)}"${item.style ? ` style="${esc(item.style)}"` : ''}>${icon(item.icon)}<span>${esc(item.label)}</span>${item.value === current ? icon('check', 'icon dd-check') : ''}</div>`)).join('');
  doc.body.append(el);
  // Placed below the owner, or above it when there is more room there; as wide as the owner at least; inside the window.
  const r = owner.getBoundingClientRect();
  const view = doc.defaultView;
  const below = view.innerHeight - r.bottom - 6; const above = r.top - 6;
  const up = below < Math.min(el.scrollHeight, 240) && above > below;
  el.style.maxHeight = `${Math.max(120, Math.min(420, up ? above : below))}px`;
  el.style.minWidth = `${Math.round(r.width)}px`;
  const width = el.getBoundingClientRect().width;
  el.style.left = `${Math.max(4, Math.min(r.left, view.innerWidth - width - 4))}px`;
  if (up) el.style.bottom = `${Math.round(view.innerHeight - r.top + 2)}px`; else el.style.top = `${Math.round(r.bottom + 2)}px`;
  owner.setAttribute('aria-expanded', 'true');
  openList = { el, owner, choose, active: null };
  setActive(el.querySelector('.dd-item.chosen') ?? (query ? el.querySelector('.dd-item:not(.disabled)') : null));
  el.addEventListener('pointerdown', (event) => event.preventDefault());
  el.addEventListener('click', (event) => {
    const item = event.target.closest('.dd-item');
    if (!item || item.classList.contains('disabled')) return;
    const pick = openList?.choose;
    close();
    pick?.(item.dataset.value);
  });
  el.addEventListener('pointermove', (event) => { const item = event.target.closest('.dd-item:not(.disabled)'); if (item) setActive(item, false); });
}

function setActive(item, scroll = true) {
  if (!openList) return;
  openList.active?.classList.remove('active');
  openList.active = item ?? null;
  if (!item) return;
  item.classList.add('active');
  if (scroll) item.scrollIntoView({ block: 'nearest' });
}

/** Keys while a list is open: ↑ ↓ PageUp PageDown Home End move, Enter picks, Esc and Tab close, letters jump. */
function listKey(event) {
  if (!openList) return false;
  const items = [...openList.el.querySelectorAll('.dd-item:not(.disabled)')];
  const at = items.indexOf(openList.active);
  const go = (index) => { setActive(items[Math.max(0, Math.min(items.length - 1, index))]); event.preventDefault(); return true; };
  switch (event.key) {
    case 'ArrowDown': return go(at < 0 ? 0 : at + 1);
    case 'ArrowUp': return go(at < 0 ? items.length - 1 : at - 1);
    case 'PageDown': return go(at + 8);
    case 'PageUp': return go(at - 8);
    case 'Home': return openList.owner.tagName === 'SELECT' ? go(0) : false;
    case 'End': return openList.owner.tagName === 'SELECT' ? go(items.length - 1) : false;
    case 'Enter': {
      if (!openList.active) { close(); return false; }
      event.preventDefault();
      event.stopPropagation();
      const pick = openList.choose; const value = openList.active.dataset.value;
      close();
      pick(value);
      return true;
    }
    case 'Escape': event.preventDefault(); event.stopPropagation(); close(); return true;
    case 'Tab': close({ focus: false }); return false;
    default:
      if (openList.owner.tagName === 'SELECT' && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        const from = at + 1;
        const next = [...items.slice(from), ...items.slice(0, from)].find((item) => item.textContent.trim().toLowerCase().startsWith(key));
        if (next) { setActive(next); event.preventDefault(); return true; }
      }
      return false;
  }
}

// ───────────────────────── <select>

const selectItems = (select) => {
  const items = [];
  for (const child of select.children) {
    if (child.tagName === 'OPTGROUP') {
      items.push({ group: child.label });
      for (const option of child.children) items.push({ value: option.value, label: option.textContent.trim() || option.value, icon: optionIcon(select, option), disabled: option.disabled });
    } else if (child.tagName === 'OPTION' && !child.hidden) {
      items.push({ value: child.value, label: child.textContent.trim() || child.value, icon: optionIcon(select, child), disabled: child.disabled });
    }
  }
  return items;
};

function refreshSelect(select) {
  const option = select.options[select.selectedIndex];
  const color = select.ownerDocument.defaultView.getComputedStyle(select).color || '#555';
  select.style.backgroundImage = iconUrl(optionIcon(select, option), color);
}

function openSelect(select) {
  if (select.disabled) return;
  select.focus({ preventScroll: true });
  open(select, selectItems(select), select.value, (value) => {
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

let ids = 0;
function enhanceSelect(select) {
  if (select.dataset.dd || select.multiple || select.size > 1 || 'native' in select.dataset) return;
  select.dataset.dd = '1';
  select.dataset.ddId = String(++ids);
  select.classList.add('dd-select');
  select.setAttribute('aria-haspopup', 'listbox');
  // A value set from code (not by the user) also updates the icon.
  for (const key of ['value', 'selectedIndex']) {
    const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, key);
    Object.defineProperty(select, key, { configurable: true, get() { return proto.get.call(this); }, set(v) { proto.set.call(this, v); refreshSelect(this); } });
  }
  refreshSelect(select);
}

// ───────────────────────── <input list="…">

function listItems(input) {
  const list = input.ownerDocument.getElementById(input.dataset.ddList);
  if (!list) return [];
  return [...list.querySelectorAll('option')].map((option) => ({
    value: option.value,
    label: option.textContent.trim() || option.value,
    icon: optionIcon(list, option),
    style: input.dataset.ddList === 'dl-fonts' ? `font-family: "${option.value.replace(/"/g, '')}", sans-serif` : '',
  }));
}

function openInputList(input, { filter = false } = {}) {
  if (input.disabled || input.readOnly) return;
  open(input, listItems(input), input.value, (value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // A pick commits like Enter does in the editors: the box lets go of the focus. Left focused, its later
    // blur would commit again and redraw the panel under the next click (a click on a tab was lost).
    input.blur();
  }, { filterText: filter ? input.value : '' });
}

function enhanceInput(input) {
  if (input.dataset.dd) return;
  input.dataset.dd = '1';
  input.dataset.ddId = String(++ids);
  // The browser's own suggestions (no icons) are switched off; ours take their place.
  input.dataset.ddList = input.getAttribute('list');
  input.removeAttribute('list');
  input.classList.add('dd-input');
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('autocomplete', 'off');
}

// ───────────────────────── wiring

function enhance(node) {
  if (node.nodeType !== 1) return;
  if (node.matches('select')) enhanceSelect(node);
  else if (node.matches('input[list]')) enhanceInput(node);
  for (const select of node.querySelectorAll('select')) enhanceSelect(select);
  for (const input of node.querySelectorAll('input[list]')) enhanceInput(input);
}

/** Turns every present and future <select> and <input list> of the document into a dropdown with icons. */
export function installDropdowns(doc = document) {
  if (doc.__dropdowns) return;
  doc.__dropdowns = true;
  const start = () => {
    enhance(doc.body);
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) enhance(node);
      if (openList && !openList.owner.isConnected) close({ focus: false });
    }).observe(doc.body, { childList: true, subtree: true });
    // Theme changes recolour the icons drawn inside the selects.
    new MutationObserver(() => { for (const select of doc.querySelectorAll('select.dd-select')) refreshSelect(select); })
      .observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  };
  if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start, { once: true });

  doc.addEventListener('pointerdown', (event) => {
    const select = event.target.closest?.('select.dd-select');
    if (select && event.button === 0) {
      event.preventDefault();
      if (openList?.owner === select) close(); else openSelect(select);
      return;
    }
    const input = event.target.closest?.('input.dd-input');
    if (input && event.button === 0) {
      if (openList?.owner !== input) setTimeout(() => openInputList(input), 0);
      return;
    }
    if (openList && !event.target.closest?.('.dd-list')) close({ focus: false });
  }, true);
  doc.addEventListener('keydown', (event) => {
    if (listKey(event)) return;
    const select = event.target.closest?.('select.dd-select');
    if (select && !openList && (event.key === ' ' || event.key === 'Enter' || event.key === 'F4' || (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')))) {
      event.preventDefault();
      openSelect(select);
      return;
    }
    const input = event.target.closest?.('input.dd-input');
    if (input && !openList && event.key === 'ArrowDown') { event.preventDefault(); openInputList(input); }
  }, true);
  doc.addEventListener('input', (event) => {
    const input = event.target.closest?.('input.dd-input');
    if (input && event.isTrusted) openInputList(input, { filter: true });
  }, true);
  doc.addEventListener('change', (event) => { if (event.target.matches?.('select.dd-select')) refreshSelect(event.target); }, true);
  doc.addEventListener('focusout', (event) => { if (openList && event.target === openList.owner && !openList.el.contains(event.relatedTarget)) setTimeout(() => { if (openList?.owner === event.target && doc.activeElement !== event.target) close({ focus: false }); }, 0); }, true);
  doc.defaultView.addEventListener('resize', () => close({ focus: false }));
  doc.defaultView.addEventListener('blur', () => close({ focus: false }));
  doc.addEventListener('scroll', (event) => { if (openList && !openList.el.contains(event.target)) close({ focus: false }); }, true);
}

// Property widgets: number (decrease · value · increase, also drag on the value), colour, toggle, drop-down, vector, text,
// and collapsible panels. Each takes an onChange and reports `final` = false while a drag is still going on.
import { h, parseNumber } from './dom.js';
import { icon } from './icons.js';
import { enumName, t } from './i18n.js';

const format = (v, digits) => {
  if (!Number.isFinite(v)) return '';
  const fixed = Math.abs(v) >= 1000 ? v.toFixed(1) : v.toFixed(digits);
  return digits > 0 ? fixed.replace(/\.?0+$/, '') || '0' : fixed;
};

export function numField({ value, onChange, step = 0.1, min = -Infinity, max = Infinity, int = false, suffix = '', testid, label, decimals }) {
  const digits = decimals ?? (int ? 0 : step >= 1 ? 2 : step >= 0.1 ? 3 : 4);
  const clamp = (v) => { const c = Math.min(max, Math.max(min, v)); return int ? Math.round(c) : c; };
  const shown = (v) => `${format(v, digits)}${suffix}`;
  let current = value;
  const input = h('input', { type: 'text', value: shown(value), spellcheck: false, dataset: testid ? { testid } : undefined, className: 'num-input' });
  const commit = (next, final = true) => {
    if (!Number.isFinite(next)) { input.value = shown(current); return; }
    const v = clamp(next);
    input.value = shown(v);
    if (v !== current || final) { const changed = v !== current; current = v; if (changed) onChange(v, final); }
  };
  const parse = () => parseNumber(input.value.replace(suffix, ''));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { commit(parse()); input.blur(); } else if (e.key === 'Escape') { input.value = shown(current); input.blur(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); commit(current + (e.key === 'ArrowUp' ? step : -step)); }
  });
  input.addEventListener('blur', () => { if (input.dataset.editing) { delete input.dataset.editing; input.readOnly = true; commit(parse()); } });
  input.readOnly = true;
  // A click edits the text, a horizontal drag scrubs the value.
  input.addEventListener('pointerdown', (e) => {
    if (input.dataset.editing || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = current;
    let dragged = false;
    const win = input.ownerDocument.defaultView;
    const move = (m) => {
      if (!dragged && Math.abs(m.clientX - startX) < 3) return;
      dragged = true;
      const k = m.shiftKey ? 0.1 : 1;
      commit(start + Math.round((m.clientX - startX) * k) * step, false);
    };
    const up = () => {
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      if (dragged) { if (current !== start) onChange(current, true); return; }
      input.dataset.editing = '1';
      input.readOnly = false;
      input.value = format(current, Math.max(digits, 3));
      input.focus();
      input.select();
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
  });
  const stepper = (sign, name) => h('button', { type: 'button', tabIndex: -1, className: 'num-step', title: `${sign > 0 ? '+' : '−'}${step}`, onClick: () => commit(current + sign * step) }, icon(name, 11));
  const box = h('span', { className: 'num-field' }, stepper(-1, 'left'), input, stepper(1, 'right'));
  return label ? row(label, box) : box;
}

export function row(label, control, extra) {
  return h('div', { className: 'prop-row', title: typeof label === 'string' ? label : undefined }, h('label', { className: 'prop-label' }, label), h('div', { className: 'prop-value' }, control), extra ?? null);
}

export function vecField({ value, onChange, step = 0.1, labels = ['X', 'Y', 'Z'], testid, min, max }) {
  return h('div', { className: 'vec-field' }, value.map((v, i) => h('div', { className: 'vec-row' },
    h('span', { className: `axis-tag axis-${['x', 'y', 'z', 'w'][i]}` }, labels[i]),
    numField({ value: v, step, min, max, testid: testid ? `${testid}-${i}` : undefined, onChange: (n, final) => { const next = [...value]; next[i] = n; value[i] = n; onChange(next, final, i); } }))));
}

const toHex = (c) => `#${c.slice(0, 3).map((x) => Math.round(Math.max(0, Math.min(1, x)) ** (1 / 2.2) * 255).toString(16).padStart(2, '0')).join('')}`;
const fromHex = (s) => [1, 3, 5].map((i) => (parseInt(s.slice(i, i + 2), 16) / 255) ** 2.2);

/** A colour swatch. Colours are stored linear, shown and picked in display space. */
export function colorField({ value, onChange, testid }) {
  return h('input', {
    type: 'color', className: 'color-field', value: toHex(value), dataset: testid ? { testid } : undefined,
    onInput: (e) => onChange(fromHex(e.target.value), false),
    onChange: (e) => onChange(fromHex(e.target.value), true),
  });
}

export function toggle({ value, onChange, label, testid }) {
  const input = h('input', { type: 'checkbox', checked: Boolean(value), dataset: testid ? { testid } : undefined, onChange: (e) => onChange(e.target.checked, true) });
  return h('label', { className: 'toggle' }, input, h('span', null, label ?? ''));
}

export function select({ value, options, onChange, testid, nameOf = enumName }) {
  return h('select', { className: 'select', dataset: testid ? { testid } : undefined, onChange: (e) => onChange(e.target.value, true) },
    options.map((o) => {
      const [id, name] = Array.isArray(o) ? o : [o, nameOf(o)];
      return h('option', { value: id ?? '', selected: id === value }, name);
    }));
}

export function textField({ value, onChange, testid, placeholder }) {
  return h('input', {
    type: 'text', className: 'text-field', value: value ?? '', placeholder, spellcheck: false, dataset: testid ? { testid } : undefined,
    onChange: (e) => onChange(e.target.value, true),
    onKeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
  });
}

export function button(label, onClick, { icon: name, testid, title, className = '', disabled } = {}) {
  return h('button', { type: 'button', className: `btn ${className}`, title: title ?? undefined, disabled: disabled ?? false, dataset: testid ? { testid } : undefined, onClick }, name ? icon(name, 14) : null, label ? h('span', null, label) : null);
}

const collapsed = new Set();
/** A panel with a header that folds it; the fold is remembered for the session. */
export function panel(id, title, children, { actions = null, closed = false, icon: name } = {}) {
  if (closed && !collapsed.has(`init:${id}`)) { collapsed.add(`init:${id}`); collapsed.add(id); }
  const body = h('div', { className: 'panel-body' }, children);
  const root = h('section', { className: `panel${collapsed.has(id) ? ' closed' : ''}`, dataset: { panel: id } });
  const head = h('header', {
    className: 'panel-head',
    onClick: (e) => {
      if (e.target.closest('button, input, select')) return;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      root.classList.toggle('closed', collapsed.has(id));
    },
  }, icon('down', 11), name ? icon(name, 14) : null, h('span', { className: 'panel-title' }, title), actions ? h('span', { className: 'panel-actions' }, actions) : null);
  root.append(head, body);
  return root;
}

export const emptyNote = (text) => h('div', { className: 'empty-note' }, text);
export const noteLine = (text) => h('div', { className: 'note-line' }, text ?? t('', ''));

/** The heading of a side panel. The arrow points the way the panel will go. */
export function sideHead({ icon: name, title, side = 'right', collapsed = false, onToggle, testid }) {
  const arrow = (side === 'right') === collapsed ? 'left' : 'right';
  const label = collapsed ? t('Expand', '펼치기') : t('Collapse', '접기');
  return h('div', { className: 'side-head' }, icon(name, 14), h('span', { className: 'side-title' }, title),
    h('button', { type: 'button', className: 'side-fold', title: `${label}: ${title}`, dataset: testid ? { testid } : undefined, onClick: onToggle }, icon(arrow, 11)));
}

/** Wraps a panel's content with that heading. `store` remembers whether it is folded. */
export function sidePanel({ id, side = 'right', icon: name, title, body, store, onChange }) {
  const root = h('div', { className: `side-panel ${side}`, dataset: { testid: `side-panel-${id}` } });
  body.classList.add('side-panel-body');
  const sync = () => {
    const collapsed = Boolean(store[`${id}Collapsed`]);
    root.classList.toggle('collapsed', collapsed);
    root.replaceChildren(sideHead({ icon: name, title: title(), side, collapsed, testid: `side-fold-${id}`, onToggle: () => { store[`${id}Collapsed`] = !collapsed; sync(); onChange?.(); } }), body);
  };
  sync();
  return root;
}

// DOM helpers.
import { icon } from './icons.js';

/**
 * h('div.card#id', { onclick, title, dataset: {…}, style: {…} }, children…)
 * Children: nodes, strings (text), arrays, null/false (skipped).
 */
export function h(tag, props = {}, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const part of rest) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = {};
  }
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className += ` ${value}`;
    else if (key === 'style' && typeof value === 'object') {
      for (const [name, v] of Object.entries(value)) {
        if (name.startsWith('--')) el.style.setProperty(name, v); else el.style[name] = v;
      }
    }
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string' && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Element from SVG markup of an icon. */
export function iconEl(name, className = '') {
  const span = document.createElement('span');
  span.className = `icon-wrap ${className}`;
  span.innerHTML = icon(name);
  return span;
}

/** Toolbar / panel button with an icon and optional label. */
export function button(iconName, label, onclick, { title, className = '', id, showLabel = false, disabled = false } = {}) {
  const el = h(`button.tool${className ? `.${className.split(' ').join('.')}` : ''}`, { type: 'button', title: title ?? label, 'aria-label': label, onclick, id, disabled });
  if (iconName) el.innerHTML = icon(iconName);
  if (showLabel) el.append(h('span.tool-label', label));
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Runs `fn` at most once per animation frame. */
export function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; fn(...lastArgs); });
  };
}

export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Is the keyboard focus in a text field (shortcuts must not fire there)? */
export function typing(event) {
  const target = event.target;
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) && !(target.type === 'range' || target.type === 'checkbox' || target.type === 'radio' || target.type === 'button');
}

/** Drag with the pointer: onMove(dx, dy, event), onEnd(event). Returns the pointerdown handler. */
export function dragHandler({ onStart, onMove, onEnd, cursor }) {
  return (event) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    if (onStart?.(event) === false) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    if (cursor) document.body.style.cursor = cursor;
    const move = (e) => onMove?.(e.clientX - startX, e.clientY - startY, e);
    const up = (e) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      onEnd?.(e, e.clientX - startX, e.clientY - startY);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
}

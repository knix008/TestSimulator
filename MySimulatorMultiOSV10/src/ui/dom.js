// A tiny DOM builder: h('div', { className: 'x', onClick }, child, …).
// Attributes starting with "on" become listeners, `style` may be an object,
// `dataset` sets data-*, and null/false children are skipped.

export function h(tag, attrs = null, ...children) {
  const el = tag === 'svg' || attrs?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false || key === 'svg') continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'className') el.setAttribute('class', value);
      else if (key in el && !(el instanceof SVGElement) && key !== 'list' && key !== 'type') el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
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

export function svg(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Replaces the children of `el` (keeps `el` itself, so listeners on it survive). */
export function replace(el, ...children) {
  // Re-rendering a list (a click that selects an item redraws it) must not jump it back to the top:
  // remember the scroll of the element and of its scrolled ancestors, and put it back.
  const scrolled = [];
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (node.scrollTop || node.scrollLeft) scrolled.push([node, node.scrollTop, node.scrollLeft]);
  }
  clear(el);
  append(el, children);
  for (const [node, top, left] of scrolled) {
    if (node.scrollTop !== top) node.scrollTop = top;
    if (node.scrollLeft !== left) node.scrollLeft = left;
  }
  return el;
}

/**
 * A number field with − / + steppers (the MyCAD control). `onChange(value)` fires on commit
 * (Enter, blur, a stepper click). `step` sets the stepper size; `digits` the display precision.
 */
export function numberField({ value, onChange, step = 1, min = -Infinity, max = Infinity, suffix = '', digits = 6, testid = null, title = null, disabled = false }) {
  const format = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(digits))) : '');
  const input = h('input', { type: 'text', inputMode: 'decimal', value: format(value), title, disabled, dataset: testid ? { testid } : undefined });
  let current = value;
  const commit = (next) => {
    if (!Number.isFinite(next)) {
      input.value = format(current);
      return;
    }
    const clamped = Math.min(max, Math.max(min, next));
    input.value = format(clamped);
    if (clamped !== current) {
      current = clamped;
      onChange(clamped);
    }
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commit(parseNumber(input.value));
      input.select();
    } else if (event.key === 'Escape') {
      input.value = format(current);
      input.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      commit((parseNumber(input.value) || 0) + (event.key === 'ArrowUp' ? step : -step));
    }
    event.stopPropagation();
  });
  input.addEventListener('blur', () => commit(parseNumber(input.value)));
  const minus = h('button', { type: 'button', tabIndex: -1, disabled, title: `−${step}`, onClick: () => commit((parseNumber(input.value) || 0) - step) }, '−');
  const plus = h('button', { type: 'button', tabIndex: -1, disabled, title: `+${step}`, onClick: () => commit((parseNumber(input.value) || 0) + step) }, '+');
  return h('span', { className: disabled ? 'number-field off' : 'number-field' }, minus, input, plus, suffix ? h('span', { className: 'number-suffix' }, suffix) : null);
}

/** Parses "1.5e-3", "1,5" (decimal comma) and simple expressions like "2*3" or "1e5/4". */
export function parseNumber(text) {
  const clean = String(text).trim().replace(/,/g, '.').replace(/\s+/g, '');
  if (!clean) return NaN;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return Number(clean);
  if (/^[\d.eE+\-*/()]+$/.test(clean)) {
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(`"use strict"; return (${clean});`)();
      return typeof v === 'number' ? v : NaN;
    } catch {
      return NaN;
    }
  }
  return NaN;
}

/** Union Jack (shown while the UI is Korean: the click switches to English). */
export function unionJack(size = 15) {
  return svg(`<svg width="${size * 1.5}" height="${size}" viewBox="0 0 60 40" role="img" aria-label="English" data-testid="flag-en">
    <rect width="60" height="40" fill="#012169"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" stroke-width="8"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" stroke-width="4"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#ffffff" stroke-width="13"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" stroke-width="8"/></svg>`);
}

/** Taegukgi to the standard's proportions (shown while the UI is English). */
export function taegukgi(size = 15) {
  const BAR = 12; const THICK = 2; const STEP = 3.6; const SPLIT = 2;
  const trigram = (cx, cy, rotate, solid) => `<g transform="rotate(${rotate} ${cx} ${cy})">${solid.map((whole, index) => {
    const y = cy + (index - 1) * STEP - THICK / 2;
    if (whole) return `<rect x="${cx - BAR / 2}" y="${y}" width="${BAR}" height="${THICK}" fill="#000"/>`;
    const half = (BAR - SPLIT) / 2;
    return `<rect x="${cx - BAR / 2}" y="${y}" width="${half}" height="${THICK}" fill="#000"/><rect x="${cx + SPLIT / 2}" y="${y}" width="${half}" height="${THICK}" fill="#000"/>`;
  }).join('')}</g>`;
  return svg(`<svg width="${size * 1.5}" height="${size}" viewBox="0 0 60 40" role="img" aria-label="한국어" data-testid="flag-ko">
    <rect width="60" height="40" fill="#ffffff"/>
    <g transform="rotate(-33.69 30 20) translate(60 0) scale(-1 1)">
      <circle cx="30" cy="20" r="10" fill="#CD2E3A"/>
      <path d="M20,20 a5,5 0 0,1 10,0 a5,5 0 0,0 10,0 a10,10 0 0,1 -20,0" fill="#0047A0"/>
    </g>
    ${trigram(10.6, 7.1, -56.31, [true, true, true])}${trigram(49.4, 7.1, 56.31, [false, true, false])}
    ${trigram(10.6, 32.9, -123.69, [true, false, true])}${trigram(49.4, 32.9, 123.69, [false, false, false])}</svg>`);
}

/** The About mark from MyCAD's toolbar: an "i" in a circle, drawn in currentColor. */
export function aboutMark() {
  return svg(`<svg class="about-mark" viewBox="0 0 20 20" width="17" height="17" role="img"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="5.6" r="1.2" fill="currentColor"/><rect x="8.9" y="8.2" width="2.2" height="6.6" rx="1.1" fill="currentColor"/></svg>`);
}

/** A 2×2 swatch of a theme's colours (theme picker). */
export function themeSwatch(theme, size = 16) {
  const c = theme.colors;
  return h('span', { className: 'swatch', style: { width: `${size}px`, height: `${size}px`, borderColor: c.line } },
    h('i', { style: { background: c.bg } }), h('i', { style: { background: c.panel } }), h('i', { style: { background: c.accent } }), h('i', { style: { background: c.text } }));
}

export function downloadName(name, extension) {
  const base = (name || 'model').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'model';
  return `${base}.${extension}`;
}

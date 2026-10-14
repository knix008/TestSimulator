// Colour choice as a row of round swatches, plus a rainbow circle for any other
// colour (the system picker). It behaves like <input type=color>: `.value`
// ('#rrggbb'), 'input' while choosing and 'change' when chosen, so code written
// for the input works unchanged.
import { t } from '../i18n.js';
import { h } from './dom.js';

export const PALETTE = ['#ffffff', '#000000', '#7f8691', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0ff', '#2f6fe4', '#af52de', '#ff2d92'];

const norm = (value) => String(value ?? '').trim().toLowerCase();

export function colorSwatches(value = '#ffffff', { palette = PALETTE, key } = {}) {
  let current = norm(value) || palette[0];
  const el = h('div.swatches', { role: 'radiogroup', dataset: key ? { key } : {} });
  const native = h('input.swatch-native', { type: 'color', value: current, tabIndex: -1 });
  const custom = h('label.swatch-dot.swatch-custom', { title: t('color.custom'), role: 'radio' }, native);
  const dots = palette.map((color) => h('button.swatch-dot', {
    type: 'button', role: 'radio', title: color, dataset: { color }, style: { '--dot': color },
    onclick: () => choose(color, true),
  }));
  el.append(...dots, custom);

  function mark() {
    let matched = false;
    for (const dot of dots) {
      const on = dot.dataset.color === current;
      matched ||= on;
      dot.classList.toggle('on', on);
      dot.setAttribute('aria-checked', String(on));
    }
    custom.classList.toggle('on', !matched);
    custom.style.setProperty('--dot', matched ? 'transparent' : current);
    native.value = current;
  }

  function choose(color, done) {
    current = norm(color);
    mark();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (done) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  native.addEventListener('input', (event) => { event.stopPropagation(); choose(native.value, false); });
  native.addEventListener('change', (event) => { event.stopPropagation(); choose(native.value, true); });
  Object.defineProperty(el, 'value', { get: () => current, set: (v) => { current = norm(v) || current; mark(); } });
  mark();
  return el;
}

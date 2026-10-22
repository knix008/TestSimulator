/* Step buttons for every number field and slider, in the main window, the dialogs and the popup windows:
 *
 *   number:  [−] [  value  ] [+]          the value centred between the buttons
 *   slider:  [−] [====o=====] [+] value   the value to the right of the + button
 *
 * A slider's own value label (the next element when it carries class "val" / "frame-label", an id ending
 * in "V" or [data-z]) is moved behind the + button; otherwise one is added. data-spin-format on the slider
 * picks how an added label reads: "index" → "n / total" (0-based sliders), "percent" → "n%", default: the value.
 * Fields that already have their own buttons (the W / L fields) or carry data-spin="off" are left alone.
 * A press steps once; holding the button repeats. Each step fires 'input' and 'change' like a user edit.
 * Fields added later (dialogs, popups) are picked up by a MutationObserver.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Spin = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VALUE = typeof HTMLInputElement !== 'undefined' ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') : null;

  const decimals = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  /** The next value one step up (dir 1) or down (dir −1), on the step grid and inside min / max. */
  function stepped(inp, dir) {
    const min = inp.min !== '' ? parseFloat(inp.min) : -Infinity, max = inp.max !== '' ? parseFloat(inp.max) : Infinity;
    // no step attribute means 1 (HTML default); "any" has no grid, so a slider takes 1/100 of its range
    let step = parseFloat(inp.step);
    if (!(step > 0)) step = String(inp.step).toLowerCase() === 'any' && inp.type === 'range' && Number.isFinite(min) && Number.isFinite(max) ? (max - min) / 100 : 1;
    let v = parseFloat(inp.value);
    if (!Number.isFinite(v)) v = Number.isFinite(min) ? min : 0;
    const base = Number.isFinite(min) ? min : 0;
    let next = base + Math.round((v - base) / step + dir) * step;
    next = Math.max(min, Math.min(max, next));
    return +next.toFixed(Math.min(10, Math.max(decimals(step), decimals(base))));
  }
  function bump(inp, dir) {
    if (inp.disabled || inp.readOnly) return;
    const next = stepped(inp, dir);
    if (String(next) === inp.value) return;
    inp.value = String(next);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(inp, dir) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `spin-btn ${dir < 0 ? 'spin-dec' : 'spin-inc'}`;
    b.textContent = dir < 0 ? '−' : '+';
    b.tabIndex = -1;
    b.setAttribute('aria-label', dir < 0 ? '−' : '+');
    let timer = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      bump(inp, dir);
      const again = (ms) => { timer = setTimeout(() => { bump(inp, dir); again(60); }, ms); };
      again(420);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
    // keyboard / scripted clicks (no pointer): one step
    b.addEventListener('click', (e) => { if (e.detail === 0) bump(inp, dir); });
    b.disabled = inp.disabled;
    return b;
  }
  function format(inp) {
    const v = parseFloat(inp.value);
    switch (inp.dataset.spinFormat) {
      case 'index': return `${(Number.isFinite(v) ? v : 0) + 1} / ${(parseFloat(inp.max) || 0) + 1}`;
      case 'percent': return `${inp.value}%`;
      default: return inp.value;
    }
  }
  const isValueLabel = (el) => !!el && el.tagName !== 'INPUT' && el.tagName !== 'BUTTON' && (el.classList.contains('val') || el.classList.contains('frame-label') || /V$/.test(el.id || '') || el.hasAttribute('data-z'));

  function enhance(inp) {
    if (inp.dataset.spin === 'off' || inp.closest('.spin') || inp.closest('.wl-field') || inp.closest('[data-spin="off"]')) return;
    const range = inp.type === 'range';
    const wrap = document.createElement('span');
    wrap.className = range ? 'spin spin-range' : 'spin spin-number';
    const own = range ? inp.nextElementSibling : null;
    inp.replaceWith(wrap);
    const dec = button(inp, -1), inc = button(inp, 1);
    wrap.append(dec, inp, inc);
    if (range) {
      let label = isValueLabel(own) ? own : null;
      if (label) wrap.append(label);
      else {
        label = document.createElement('span');
        label.className = 'spin-val';
        wrap.append(label);
        const show = () => { label.textContent = format(inp); };
        // programmatic changes (a frame shown by the player) update the label too
        if (VALUE) Object.defineProperty(inp, 'value', { configurable: true, get() { return VALUE.get.call(this); }, set(v) { VALUE.set.call(this, v); show(); } });
        inp.addEventListener('input', show);
        new MutationObserver(show).observe(inp, { attributes: true, attributeFilter: ['max', 'min'] });
        show();
      }
    }
    // the buttons follow the field's disabled state
    new MutationObserver(() => { dec.disabled = inc.disabled = inp.disabled; }).observe(inp, { attributes: true, attributeFilter: ['disabled'] });
  }

  function scan(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    const list = rootEl.matches && rootEl.matches('input[type=number], input[type=range]') ? [rootEl] : [];
    list.push(...rootEl.querySelectorAll('input[type=number], input[type=range]'));
    list.forEach(enhance);
  }
  function start() {
    scan(document.body);
    let pending = false;
    new MutationObserver((records) => {
      if (pending) return;
      if (!records.some((r) => r.addedNodes.length)) return;
      pending = true;
      queueMicrotask(() => { pending = false; scan(document.body); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  return { enhance, scan, stepped };
});

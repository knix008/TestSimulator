/**
 * Number fields with − / + buttons on either side (settings dialogs).
 *
 * `enhanceNumberInputs(root)` wraps every `<input type="number">` under
 * `root` that is not wrapped yet: the buttons step by the input's `step`
 * (scrollback uses 100) within `min` … `max`, and fire the same `input` /
 * `change` events typing does, so the existing listeners keep working.
 * Typing directly stays possible.
 */
export function stepNumber(value, step, dir, min, max) {
  const s = Number(step) || 1;
  const base = Number.isFinite(Number(value)) && value !== '' ? Number(value) : Number(min) || 0;
  // Snap to the step grid so 10,050 + 100 → 10,100 rather than 10,150.
  let next = s >= 1 ? Math.round((base + dir * s) / s) * s : base + dir * s;
  if (Number.isFinite(Number(min)) && min !== '') next = Math.max(Number(min), next);
  if (Number.isFinite(Number(max)) && max !== '') next = Math.min(Number(max), next);
  return s >= 1 ? Math.round(next) : next;
}

export function enhanceNumberInputs(root) {
  if (!root) return;
  root.querySelectorAll('input[type="number"]').forEach((input) => {
    if (input.closest('.num-field')) return;
    const wrap = document.createElement('span');
    wrap.className = 'num-field';
    input.parentNode.insertBefore(wrap, input);
    const mk = (dir) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `num-btn num-btn-${dir < 0 ? 'dec' : 'inc'}`;
      btn.tabIndex = -1;
      btn.textContent = dir < 0 ? '−' : '+';
      btn.setAttribute('aria-label', dir < 0 ? '−' : '+');
      btn.addEventListener('click', () => {
        if (input.disabled) return;
        input.value = String(stepNumber(input.value, input.step, dir, input.min, input.max));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        syncDisabled();
      });
      return btn;
    };
    const dec = mk(-1);
    const inc = mk(1);
    const syncDisabled = () => {
      const v = Number(input.value);
      dec.disabled = input.disabled || (input.min !== '' && v <= Number(input.min));
      inc.disabled = input.disabled || (input.max !== '' && v >= Number(input.max));
    };
    wrap.appendChild(dec);
    wrap.appendChild(input);
    wrap.appendChild(inc);
    input.addEventListener('input', syncDisabled);
    input.addEventListener('change', syncDisabled);
    // Disabled state of the input (profile detail without a selection) reaches the buttons.
    new MutationObserver(syncDisabled).observe(input, { attributes: true, attributeFilter: ['disabled'] });
    syncDisabled();
  });
}

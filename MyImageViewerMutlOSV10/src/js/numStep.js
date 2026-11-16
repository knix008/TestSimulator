/* Decrease / increase around every numeric field and slider.
   Order: −, control, value, unit, +. Quality readouts gain a % unit.
   Transport bars keep their own previous / next controls. */
window.NumStep = (() => {
  const SKIP = '.num-step, .pct-step, .ai-param-line, .et-stepper, .settings-start-ctrl, .start-speed, .browse-zoom, .media-ctrl-seek-wrap';

  function shouldSkip(input) {
    if (input.id === 'mc-seek' || input.id === 'dcm-frame') return true;
    return !!input.closest(SKIP);
  }

  function isValueNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches('input, select, button, label, textarea')) return false;
    if (node.matches('output, .dlg-unit, .effect-value, .fd-quality-val, .settings-value, .media-ctrl-vol-label, .num-step-unit, .num-step-val')) return true;
    const text = (node.textContent || '').trim();
    return node.matches('span') && (/^(px|fps|%|°|mm)$/.test(text) || /^[-+]?\d+(\.\d+)?%?$/.test(text));
  }

  function button(dir, input) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-step';
    btn.textContent = dir < 0 ? '−' : '+';
    const key = dir < 0 ? 'effects.autoDown' : 'effects.autoUp';
    btn.title = (window.I18n && I18n.t(key)) || (dir < 0 ? 'Decrease' : 'Increase');
    btn.setAttribute('data-i18n-title', key);
    btn.addEventListener('click', () => nudge(input, dir));
    return btn;
  }

  function nudge(input, dir) {
    if (!input || input.disabled) return;
    const raw = Number(input.step);
    const step = Number.isFinite(raw) && raw > 0 ? raw : 1;
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    const cur = Number(input.value);
    const base = Number.isFinite(cur) ? cur : (Number.isFinite(min) ? min : 0);
    const places = (String(step).split('.')[1] || '').length;
    let next = Number((base + dir * step).toFixed(Math.min(6, places + 2)));
    next = Math.max(min, Math.min(max, next));
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syncEnds(input, minus, plus) {
    const v = Number(input.value);
    const known = Number.isFinite(v);
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    minus.disabled = input.disabled || (known && v <= min);
    plus.disabled = input.disabled || (known && v >= max);
  }

  function needsPercent(input, values) {
    if (!/quality/i.test(input.id)) return false;
    return !values.some((node) => (node.textContent || '').includes('%'));
  }

  function attach(input) {
    if (!input || input.dataset.numStep) return;
    if (shouldSkip(input)) { input.dataset.numStep = 'skip'; return; }
    const values = [];
    let sib = input.nextElementSibling;
    while (isValueNode(sib)) { values.push(sib); sib = sib.nextElementSibling; }
    input.dataset.numStep = '1';
    const wrap = document.createElement('span');
    wrap.className = 'num-step';
    const minus = button(-1, input);
    const plus = button(1, input);
    input.before(wrap);
    wrap.append(minus, input, ...values);
    if (input.type === 'range' && !values.length) {
      const out = document.createElement('output');
      out.className = 'num-step-val';
      out.textContent = input.value;
      wrap.append(out);
      input.addEventListener('input', () => { out.textContent = input.value; });
    }
    if (needsPercent(input, values)) {
      const unit = document.createElement('span');
      unit.className = 'num-step-unit';
      unit.textContent = '%';
      wrap.append(unit);
    }
    wrap.append(plus);
    const sync = () => syncEnds(input, minus, plus);
    input.addEventListener('input', sync);
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'min', 'max'] });
    sync();
  }

  function scan(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches('input[type="number"], input[type="range"]')) attach(scope);
    scope.querySelectorAll?.('input[type="number"], input[type="range"]').forEach(attach);
  }

  function watch() {
    scan(document);
    new MutationObserver((records) => {
      records.forEach((rec) => {
        rec.addedNodes.forEach((node) => { if (node.nodeType === 1) scan(node); });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  return { attach, scan };
})();

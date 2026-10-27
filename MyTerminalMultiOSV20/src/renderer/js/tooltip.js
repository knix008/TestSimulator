export function initTooltips() {
  const tip = document.getElementById('tooltip');
  let active = null;

  const hide = () => {
    tip.hidden = true;
    active = null;
  };

  const show = (el) => {
    const text = el.dataset.tooltip || el.getAttribute('title') || el.getAttribute('aria-label');
    if (!text) return;
    active = el;
    tip.textContent = text;
    tip.hidden = false;

    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    if (top + tipRect.height > window.innerHeight - 8) {
      top = rect.top - tipRect.height - 8;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tooltip], [data-i18n-title], .tb-btn, .win-btn');
    if (!el || el.disabled) return;
    show(el);
  });

  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest('[data-tooltip], [data-i18n-title], .tb-btn, .win-btn');
    if (el && el === active) hide();
  });

  document.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}

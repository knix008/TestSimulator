/* Tooltip system */
window.Tooltip = (() => {
  let tip = null;
  let hideTimer = null;
  let showTimer = null;
  const DELAY = 600; // ms before showing

  function init() {
    tip = document.getElementById('tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tooltip';
      tip.className = 'tooltip';
      document.body.appendChild(tip);
    }
    // Hide on scroll / click
    document.addEventListener('scroll', hide, true);
    document.addEventListener('mousedown', hide, true);
  }

  function show(text, x, y) {
    if (!text) return;
    tip.textContent = text;
    tip.style.display = 'block';

    // Position
    const rect = tip.getBoundingClientRect();
    let left = x + 12;
    let top  = y + 20;
    if (left + rect.width  > window.innerWidth)  left = x - rect.width  - 4;
    if (top  + rect.height > window.innerHeight) top  = y - rect.height - 4;
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
  }

  function hide() {
    clearTimeout(showTimer);
    if (tip) tip.style.display = 'none';
  }

  function attach(element, getText) {
    if (!element) return;
    // A custom tooltip replaces the native one. Drop the element's `title`
    // so the OS (black background / white text) tooltip doesn't show on top
    // of the styled tooltip. Mark it so i18n won't re-add `title` on language
    // change. If no text getter was given, fall back to the native title text.
    if (!getText) {
      const nativeTitle = element.getAttribute('title');
      if (nativeTitle) getText = nativeTitle;
    }
    element.dataset.customTip = '1';
    element.removeAttribute('title');

    element.addEventListener('mouseenter', (e) => {
      clearTimeout(hideTimer);
      showTimer = setTimeout(() => {
        const text = typeof getText === 'function' ? getText() : getText;
        show(text, e.clientX, e.clientY);
      }, DELAY);
    });
    element.addEventListener('mousemove', (e) => {
      if (tip && tip.style.display === 'block') {
        show(tip.textContent, e.clientX, e.clientY);
      }
    });
    element.addEventListener('mouseleave', () => {
      clearTimeout(showTimer);
      hideTimer = setTimeout(hide, 100);
    });
  }

  return { init, show, hide, attach };
})();

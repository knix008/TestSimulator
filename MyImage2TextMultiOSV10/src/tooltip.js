// Tooltips for the toolbar (and anything else inside `scope`). The text is the element's title.
// A styled box replaces the browser's own tooltip: it appears quickly, follows the theme, and
// also works on disabled buttons, which get no mouse events (the element under the pointer is
// looked up from its position instead).
const DELAY_MS = 350;

export function installTooltips(scopeSelector = '.toolbar') {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  let target = null;
  let timer = 0;

  const textOf = (el) => el.getAttribute('title') || el.dataset.tip || '';
  // Holds the title while the custom tooltip shows, so the browser does not show its own too.
  const hush = (el) => {
    const title = el.getAttribute('title');
    if (title) {
      el.dataset.tip = title;
      el.removeAttribute('title');
    }
  };
  const restore = (el) => {
    if (el && !el.getAttribute('title') && el.dataset.tip) el.setAttribute('title', el.dataset.tip);
  };

  function hide() {
    clearTimeout(timer);
    tip.hidden = true;
    restore(target);
    target = null;
  }

  function show() {
    if (!target?.isConnected) return hide();
    const text = textOf(target);
    if (!text) return hide();
    hush(target);
    tip.textContent = text;
    tip.hidden = false;
    const box = target.getBoundingClientRect();
    const own = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - own.width - 6, Math.max(6, box.left + box.width / 2 - own.width / 2));
    let top = box.bottom + 6;
    if (top + own.height > window.innerHeight - 6) top = box.top - own.height - 6;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    return undefined;
  }

  function findAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === tip) continue;
      const host = el.closest(scopeSelector);
      if (!host) return null;
      const titled = el.closest('[title], [data-tip]');
      return titled && host.contains(titled) ? titled : null;
    }
    return null;
  }

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const found = findAt(event.clientX, event.clientY);
    if (found === target) return;
    hide();
    if (!found) return;
    target = found;
    timer = setTimeout(show, DELAY_MS);
  }, { passive: true });
  for (const type of ['pointerdown', 'keydown', 'scroll', 'blur']) window.addEventListener(type, hide, { capture: true, passive: true });
  document.addEventListener('pointerleave', hide);
  return { hide };
}

/* Tab strips with "<" ">" buttons on the right, ready for more tabs than fit.
 *
 * TabStrip.enhance(list) wraps a role="tablist" element: the tabs keep their natural
 * width in a row that scrolls sideways (no scroll bar), and two buttons at the right end
 * go to the previous / next tab (by clicking it, so each strip's own selection code runs)
 * and bring it into view. A button is greyed out at the first / last tab. Nothing about
 * the tabs themselves changes: their click handlers, classes and ids stay as they were.
 */
window.TabStrip = (() => {
  const CHEVRON = {
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>',
  };
  const label = (key, fallback) => {
    const s = window.I18n?.t?.(key);
    return s && s !== key ? s : fallback;
  };

  function enhance(list, { tabSelector = '[role="tab"], button' } = {}) {
    if (!list || !list.parentNode || list.closest('.tabstrip')) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tabstrip';
    for (const c of list.classList) wrap.classList.add(`tabstrip--${c}`);
    list.parentNode.insertBefore(wrap, list);
    wrap.appendChild(list);
    list.classList.add('tabstrip-scroll');

    const nav = document.createElement('div');
    nav.className = 'tabstrip-nav';
    const mk = (dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tabstrip-btn tabstrip-${dir}`;
      b.innerHTML = CHEVRON[dir];
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        step(dir === 'prev' ? -1 : 1);
      });
      return b;
    };
    const prev = mk('prev'), next = mk('next');
    nav.append(prev, next);
    wrap.appendChild(nav);

    // (the strip's bottom line and background continue under the buttons: main.css,
    // .tabstrip--<list class> > .tabstrip-nav — CSS, so a theme change reaches them)
    const tabs = () => [...list.querySelectorAll(tabSelector)].filter((t) => !t.hidden && t.offsetParent !== null);
    const isOn = (t) => t.getAttribute('aria-selected') === 'true' || t.classList.contains('active') || t.classList.contains('on');
    const current = () => tabs().findIndex(isOn);

    function step(d) {
      const all = tabs();
      const i = current();
      const target = all[Math.max(0, Math.min(all.length - 1, (i < 0 ? 0 : i) + d))];
      if (target && !isOn(target)) target.click();
      requestAnimationFrame(sync);
    }

    function sync() {
      const all = tabs();
      const i = current();
      prev.disabled = i <= 0;
      next.disabled = i < 0 || i >= all.length - 1;
      prev.title = label('tabs.prev', 'Previous tab');
      next.title = label('tabs.next', 'Next tab');
      wrap.classList.toggle('is-overflow', list.scrollWidth > list.clientWidth + 1);
      const on = all[i];
      if (on) {
        // Into view without moving the page around it
        const l = on.offsetLeft - list.offsetLeft, r = l + on.offsetWidth;
        if (l < list.scrollLeft) list.scrollLeft = l;
        else if (r > list.scrollLeft + list.clientWidth) list.scrollLeft = r - list.clientWidth;
      }
    }

    new MutationObserver(() => requestAnimationFrame(sync))
      .observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'hidden'] });
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(sync)).observe(list);
    // Wheel over the strip scrolls it sideways
    list.addEventListener('wheel', (e) => {
      if (list.scrollWidth <= list.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      list.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    sync();
    return { sync };
  }

  /** Every static tab strip in the page (dynamic ones call enhance() themselves). */
  function enhanceAll(root = document) {
    root.querySelectorAll('#tree-tabs, .settings-tabs, .tone-tabs').forEach((l) => enhance(l));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhanceAll());
  else enhanceAll();

  return { enhance, enhanceAll };
})();

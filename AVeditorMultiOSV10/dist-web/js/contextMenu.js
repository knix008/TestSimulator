/**
 * Shared floating context menu for the renderer.
 * Usage: ContextMenu.show(x, y, items)
 *   items: { label, icon?, action?, disabled?, danger?, shortcut?, separator? }
 */
export const ContextMenu = (() => {
  let _el = null;
  let _open = false;

  function _ensure() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.id = 'app-context-menu';
    _el.className = 'context-menu';
    _el.hidden = true;
    document.body.appendChild(_el);

    document.addEventListener('click', (e) => {
      if (!_open) return;
      if (_el.contains(e.target)) return;
      hide();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });

    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    return _el;
  }

  function hide() {
    if (!_el) return;
    _el.hidden = true;
    _el.innerHTML = '';
    _open = false;
  }

  function show(x, y, items = []) {
    const menu = _ensure();
    hide();

    const list = (items || []).filter(Boolean);
    if (!list.length) return;

    for (const item of list) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        menu.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'context-menu-item'
        + (item.disabled ? ' disabled' : '')
        + (item.danger ? ' danger' : '');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'context-menu-icon';
      if (item.icon) iconWrap.innerHTML = item.icon;
      row.appendChild(iconWrap);

      const label = document.createElement('span');
      label.className = 'context-menu-label';
      label.textContent = item.label || '';
      row.appendChild(label);

      if (item.shortcut) {
        const sc = document.createElement('span');
        sc.className = 'context-menu-shortcut';
        sc.textContent = item.shortcut;
        row.appendChild(sc);
      }

      if (!item.disabled && typeof item.action === 'function') {
        row.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hide();
          item.action();
        });
      }

      menu.appendChild(row);
    }

    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 4;
    if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 4;
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    _open = true;
  }

  return { show, hide };
})();

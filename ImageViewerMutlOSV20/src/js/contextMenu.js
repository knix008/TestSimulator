/* Custom context menu */
window.ContextMenu = (() => {
  let _menu   = null;
  let _active = false;

  function init() {
    _menu = document.getElementById('context-menu');
    if (!_menu) return;

    document.addEventListener('click', hide);
    document.addEventListener('contextmenu', (e) => {
      if (!_active) return;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  function show(x, y, items) {
    if (!_menu) return;
    _menu.innerHTML = '';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        _menu.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.className = `ctx-item${item.disabled ? ' disabled' : ''}${item.danger ? ' danger' : ''}`;

      if (item.icon) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'ctx-icon';
        iconWrap.innerHTML = item.icon;
        el.appendChild(iconWrap);
      } else {
        const spacer = document.createElement('div');
        spacer.className = 'ctx-icon';
        el.appendChild(spacer);
      }

      const label = document.createElement('span');
      label.textContent = item.label;
      el.appendChild(label);

      if (item.shortcut) {
        const sc = document.createElement('span');
        sc.style.cssText = 'margin-left:auto;padding-left:20px;color:var(--text-muted);font-size:11px';
        sc.textContent = item.shortcut;
        el.appendChild(sc);
      }

      if (!item.disabled && item.action) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          hide();
          item.action();
        });
      }

      _menu.appendChild(el);
    }

    // Position
    _menu.style.display = 'block';
    const rect = _menu.getBoundingClientRect();
    let left = x, top = y;
    if (left + rect.width  > window.innerWidth)  left = window.innerWidth  - rect.width  - 4;
    if (top  + rect.height > window.innerHeight) top  = window.innerHeight - rect.height - 4;
    if (left < 0) left = 4;
    if (top  < 0) top  = 4;
    _menu.style.left = `${left}px`;
    _menu.style.top  = `${top}px`;
    _active = true;
  }

  function hide() {
    if (!_menu) return;
    _menu.style.display = 'none';
    _active = false;
  }

  return { init, show, hide };
})();

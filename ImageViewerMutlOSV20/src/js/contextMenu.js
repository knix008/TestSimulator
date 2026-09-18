/* Custom context menu
 *
 * ContextMenu.show(x, y, items)
 *   item: { label, icon, detail, title, shortcut, disabled, danger, checked, inline, action,
 *           remove: { title, action },            — × button at the right of the row
 *           submenu: items | () => items | () => Promise<items> }  — flyout on hover / click
 *   { separator: true }
 *   `items` may also be a function returning the items (re-run by refreshSubmenu).
 *
 * In Electron the menu is shown in a detached popup window (electronAPI.popupMenu →
 * main.js → src/popup.html, which draws it with this same module): it can extend past
 * the app window instead of being clipped. Actions are kept here by id and run when the
 * popup reports a click. In web mode (and inside the popup page) the menu is drawn in
 * the page itself (#context-menu).
 */
window.ContextMenu = (() => {
  const CHEVRON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z"/></svg>';
  const CHECK   = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
  const CROSS   = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  let _menu   = null;
  let _active = false;
  let _subs   = [];          // open flyouts, outermost first
  let _closeTimer = null;
  let _onHide = null;        // callback for the current menu (menu bar highlight)
  let _actions = new Map();  // remote menu: id → action
  let _lastItems = null;     // remote menu: root items (array or function) for refresh
  let _seq = 0;
  let _idSeq = 0;

  function init() {
    _menu = document.getElementById('context-menu');
    if (!_menu) return;

    document.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      // Escape closes an open menu and nothing else (the app's own Escape handling runs after us)
      if (e.key === 'Escape' && _active) { hide(); e.preventDefault(); e.stopImmediatePropagation(); }
    });
    window.addEventListener('blur', hide);
    // (the popup page is resized to the work area right before a menu is shown)
    if (!document.documentElement.classList.contains('popup-host')) window.addEventListener('resize', hide);

    // Detached popup window (Electron): clicks come back by id
    if (_remote()) {
      window.electronAPI.onPopupMenuEvent((ev) => {
        if (!ev) return;
        // Events carry the sequence number of the menu they belong to; a stale "closed"
        // (the menu that was just replaced by another one) must not close the current one.
        if (ev.seq !== undefined && ev.seq !== _seq) return;
        if (ev.type === 'closed') { _active = false; _fireHide(); return; }
        const fn = _actions.get(ev.id);
        if (ev.type === 'action') {
          _active = false;
          _fireHide();
          if (fn) requestAnimationFrame(() => { try { fn(); } catch (err) { console.error(err); } });
        } else if (ev.type === 'remove' && fn) {
          try { fn(); } catch (err) { console.error(err); }
        }
      });
    }
  }

  function _remote() {
    return !!(window.electronAPI && typeof window.electronAPI.popupMenu === 'function');
  }

  // Serializable copy of the items for the popup window; actions are kept here by id.
  async function _serialize(items) {
    const out = [];
    for (const it of items || []) {
      if (!it) continue;
      if (it.separator) { out.push({ separator: true }); continue; }
      const o = {
        label: it.label, icon: it.icon || '', detail: it.detail, title: it.title, shortcut: it.shortcut,
        disabled: !!it.disabled, danger: !!it.danger, checked: !!it.checked, inline: !!it.inline,
      };
      if (typeof it.action === 'function') { o.id = `a${++_idSeq}`; _actions.set(o.id, it.action); }
      if (it.remove && typeof it.remove.action === 'function') {
        const rid = `r${++_idSeq}`;
        _actions.set(rid, it.remove.action);
        o.remove = { title: it.remove.title, id: rid };
      }
      if (it.submenu) {
        let sub = it.submenu;
        if (typeof sub === 'function') { try { sub = await sub(); } catch (err) { console.error(err); sub = []; } }
        o.submenu = await _serialize(Array.isArray(sub) ? sub : []);
      }
      out.push(o);
    }
    return out;
  }

  function _payload(items) {
    const root = document.documentElement;
    return { seq: _seq, items, theme: root.getAttribute('data-theme') || '', kind: root.getAttribute('data-theme-kind') || '', lang: root.getAttribute('lang') || '' };
  }

  async function _showRemote(x, y, items) {
    const seq = ++_seq;
    _lastItems = items;
    _actions = new Map();
    const list = await _serialize(typeof items === 'function' ? await items() : items);
    if (seq !== _seq) return;   // another menu was requested meanwhile
    _active = true;
    try { await window.electronAPI.popupMenu({ x, y, ...(_payload(list)) }); } catch (err) { console.error(err); _active = false; }
  }

  async function _refreshRemote() {
    if (!_active || _lastItems == null) return;
    const seq = _seq;
    _actions = new Map();
    const list = await _serialize(typeof _lastItems === 'function' ? await _lastItems() : _lastItems);
    if (seq !== _seq || !_active) return;
    try { await window.electronAPI.popupMenuRefresh(_payload(list)); } catch (err) { console.error(err); }
  }

  function _place(el, x, y) {
    el.style.display = 'block';
    const rect = el.getBoundingClientRect();
    let left = x, top = y;
    if (left + rect.width  > window.innerWidth)  left = window.innerWidth  - rect.width  - 4;
    if (top  + rect.height > window.innerHeight) top  = window.innerHeight - rect.height - 4;
    if (left < 0) left = 4;
    if (top  < 0) top  = 4;
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
  }

  function _runAction(item) {
    if (document.documentElement.classList.contains('popup-host')) {
      // Popup page: report the click before the window hides — a deferred callback would
      // never run in a hidden window. The app side defers the real work itself.
      try { item.action(); } catch (err) { console.error(err); }
      hide();
      return;
    }
    hide();
    // Let the menu unpaint before long-running actions (progress popup, image ops).
    requestAnimationFrame(() => {
      try { item.action(); } catch (err) { console.error(err); }
    });
  }

  function _buildRow(item, level) {
    const el = document.createElement('div');
    el.className = `ctx-item${item.disabled ? ' disabled' : ''}${item.danger ? ' danger' : ''}`
      + `${item.checked ? ' checked' : ''}${item.inline ? ' inline' : ''}${item.submenu ? ' has-sub' : ''}`;
    el._ctxItem = item;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'ctx-icon' + (item.checked ? ' ctx-check' : '');
    // A check mark takes the icon slot so the current choice stands out
    if (item.checked) iconWrap.innerHTML = CHECK;
    else if (item.icon) iconWrap.innerHTML = item.icon;
    el.appendChild(iconWrap);

    const textWrap = document.createElement('div');
    textWrap.className = 'ctx-text';
    const label = document.createElement('span');
    label.className = 'ctx-label';
    label.textContent = item.label;
    textWrap.appendChild(label);
    if (item.detail) {
      const detail = document.createElement('span');
      detail.className = 'ctx-detail';
      detail.textContent = item.detail;
      textWrap.appendChild(detail);
    }
    el.appendChild(textWrap);
    if (item.title) el.title = item.title;

    if (item.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'ctx-shortcut';
      sc.textContent = item.shortcut;
      el.appendChild(sc);
    }

    // Per-row remove button (× at the right); the row's own action is not triggered
    if (item.remove && typeof item.remove.action === 'function') {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ctx-remove';
      rm.title = item.remove.title || '';
      rm.setAttribute('aria-label', item.remove.title || 'Remove');
      rm.innerHTML = CROSS;
      rm.addEventListener('mousedown', (e) => e.stopPropagation());
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        try { item.remove.action(); } catch (err) { console.error(err); }
      });
      el.appendChild(rm);
    }

    if (item.submenu) {
      const ch = document.createElement('span');
      ch.className = 'ctx-chevron';
      ch.innerHTML = CHEVRON;
      el.appendChild(ch);
      if (!item.disabled) {
        el.addEventListener('mouseenter', () => { _cancelClose(); _openSub(el, item, level); });
        el.addEventListener('mouseleave', () => _scheduleClose(level));
      }
    } else if (!item.disabled) {
      // Moving over a plain row closes any flyout opened from a sibling
      el.addEventListener('mouseenter', () => _scheduleClose(level));
    }

    if (!item.disabled && (item.action || item.submenu)) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.action) { _runAction(item); return; }
        // Submenu without its own action: click toggles the flyout
        if (_subs[level] && _subs[level].owner === el) _closeFrom(level);
        else _openSub(el, item, level);
      });
    }
    return el;
  }

  function _fill(container, items, level) {
    container.innerHTML = '';
    for (const item of items) {
      if (!item) continue;
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        container.appendChild(sep);
        continue;
      }
      container.appendChild(_buildRow(item, level));
    }
  }

  function _cancelClose() {
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
  }

  function _scheduleClose(level) {
    _cancelClose();
    _closeTimer = setTimeout(() => _closeFrom(level), 260);
  }

  function _closeFrom(level) {
    while (_subs.length > level) {
      const s = _subs.pop();
      s.owner.classList.remove('sub-open');
      s.el.remove();
    }
  }

  async function _openSub(ownerEl, item, level) {
    if (_subs[level] && _subs[level].owner === ownerEl) return;   // already open
    _closeFrom(level);
    const sub = document.createElement('div');
    sub.className = 'ctx-submenu';
    sub.addEventListener('mouseenter', _cancelClose);
    sub.addEventListener('mouseleave', () => _scheduleClose(level));
    sub.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(sub);
    ownerEl.classList.add('sub-open');
    const entry = { el: sub, owner: ownerEl, item };
    _subs[level] = entry;
    _subs.length = level + 1;

    const placeNextTo = () => {
      const r = ownerEl.getBoundingClientRect();
      sub.style.display = 'block';
      const w = sub.getBoundingClientRect().width;
      const x = (r.right + w + 4 <= window.innerWidth) ? r.right - 2 : Math.max(4, r.left - w + 2);
      _place(sub, x, r.top - 5);
    };

    let items = item.submenu;
    if (typeof items === 'function') {
      let pending = items();
      if (pending && typeof pending.then === 'function') {
        _fill(sub, [{ label: '…', disabled: true }], level + 1);
        placeNextTo();
        try { pending = await pending; } catch (err) { console.error(err); pending = []; }
        if (_subs[level] !== entry) return;   // closed meanwhile
      }
      items = pending;
    }
    _fill(sub, Array.isArray(items) ? items : [], level + 1);
    placeNextTo();
  }

  /** Rebuild the currently open flyout at `level` (after its content changed). */
  function refreshSubmenu(level = 0) {
    if (_remote()) { _refreshRemote(); return; }
    const s = _subs[level];
    if (!s) return;
    const owner = s.owner, item = s.item;
    _closeFrom(level);
    _openSub(owner, item, level);
  }

  /** Popup page: swap the rows of the open menu, keeping the open flyout (same root row) open. */
  function replaceItems(items) {
    if (!_menu || !_active) return;
    const openIdx = _subs[0] ? Array.prototype.indexOf.call(_menu.children, _subs[0].owner) : -1;
    _closeFrom(0);
    _fill(_menu, items, 0);
    if (openIdx >= 0) {
      const el = _menu.children[openIdx];
      if (el && el._ctxItem && el._ctxItem.submenu) _openSub(el, el._ctxItem, 0);
    }
  }

  function show(x, y, items, opts) {
    if (!_menu) return;
    _fireHide();
    _onHide = (opts && typeof opts.onHide === 'function') ? opts.onHide : null;
    if (_remote()) { _showRemote(x, y, items); return; }
    if (typeof items === 'function') items = items();
    _closeFrom(0);
    _fill(_menu, items, 0);
    _place(_menu, x, y);
    _active = true;
  }

  function _fireHide() {
    const cb = _onHide;
    _onHide = null;
    if (cb) { try { cb(); } catch (err) { console.error(err); } }
  }

  function hide() {
    if (!_menu) return;
    if (_remote()) {
      const was = _active;
      _seq++;
      _active = false;
      _fireHide();
      if (was) window.electronAPI.popupMenuHide();
      return;
    }
    _cancelClose();
    _closeFrom(0);
    _menu.style.display = 'none';
    _active = false;
    _fireHide();
  }

  function isOpen() { return _active; }

  return { init, show, hide, isOpen, refreshSubmenu, replaceItems };
})();

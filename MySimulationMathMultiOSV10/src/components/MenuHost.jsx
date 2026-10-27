// The in-page menu of lib/menu.js (web build; the desktop uses child windows).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { subscribeMenu, closeMenu } from '../lib/menu';
import { Icon, menuIcon, menuColumnsNodes } from './Chrome';
import { useLanguage } from '../lib/i18n';

export function MenuHost() {
  useLanguage();
  const [menu, setMenu] = useState(null);
  const [pos, setPos] = useState(null);
  const [active, setActive] = useState(-1);
  const box = useRef(null);
  useEffect(() => subscribeMenu((m) => { setMenu(m); setPos(null); setActive(-1); }), []);
  useEffect(() => {
    if (!menu) return undefined;
    const down = (e) => { if (!(box.current && box.current.contains(e.target))) closeMenu(); };
    const key = (e) => {
      const list = menu.items.filter((x) => !x.sep && !x.disabled);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter' && active >= 0 && list[active]) { e.preventDefault(); closeMenu(); menu.onPick(list[active].id); }
    };
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('mousedown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu, active]);
  useLayoutEffect(() => {
    if (!menu || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const a = menu.anchor;
    let left = Math.min(a.left, window.innerWidth - r.width - 6);
    let top = a.bottom + 2;
    if (top + r.height > window.innerHeight - 4) top = Math.max(4, a.top - r.height - 2);
    left = Math.max(4, left);
    setPos({ left, top });
  }, [menu]);
  if (!menu) return null;
  let n = -1;
  return (
    <div ref={box} className="menu-pop ctx-menu" role="menu" style={{ left: pos ? pos.left : -9999, top: pos ? pos.top : -9999, minWidth: 200 }}>
      {menuColumnsNodes(menu.items, (it, i) => {
        if (it.sep) return <div key={`s${i}`} className="menu-sep" />;
        if (!it.disabled) n += 1;
        const idx = it.disabled ? -2 : n;
        return (
          <button key={it.id} type="button" role="menuitem" className={`menu-item ${idx === active ? 'active' : ''} ${it.on ? 'on' : ''}`} disabled={!!it.disabled}
            onMouseEnter={() => setActive(idx)} onClick={() => { closeMenu(); menu.onPick(it.id); }}>
            <Icon name={menuIcon(it)} size={14} />
            <span className="menu-item-label">{it.label}</span>
            {it.keys && <span className="menu-keys">{it.keys}</span>}
            {it.on && <Icon name="check" size={13} />}
          </button>
        );
      })}
    </div>
  );
}

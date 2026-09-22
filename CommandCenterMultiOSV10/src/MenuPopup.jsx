// The page of the menu popup window (?win=menu, see electron/main.js).
//
// Menus are drawn here rather than inside the app window so that a long menu
// is never cut off: this window is frameless and transparent, so the menu can
// extend past the app's edge exactly as an OS menu does — no scrollbar, no
// folding into columns.
//
// One window serves every menu: it is created hidden at startup and stays
// alive. The app window sends the items (menu:show), this measures the menu it
// just drew and reports the size (menuSize), the main process puts the window
// there and shows it, and a click travels back as menuPick. Escape or a click
// on nothing closes it; losing the focus closes it in the main process.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './components/Icons';
import { applyTheme, setCustomThemes } from './themes';
import './styles.css';

const bridge = () => (typeof window !== 'undefined' ? window.commandCenter : null);

export function MenuPopup() {
  const [menu, setMenu] = useState(null);   // { seq, items }
  const ref = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const api = bridge();
    if (!api || !api.onMenuShow) return undefined;
    return api.onMenuShow(({ seq, items, theme, customThemes, fontSize }) => {
      // The popup has no session of its own: the theme and font size come with every menu.
      if (Array.isArray(customThemes)) setCustomThemes(customThemes);
      if (theme) applyTheme(theme);
      document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(fontSize) || 13)}px`);
      seqRef.current = seq;
      setMenu({ seq, items: Array.isArray(items) ? items : [] });
    });
  }, []);

  // Measure the menu as drawn and let the main process place the window around it.
  useLayoutEffect(() => {
    const el = ref.current;
    const api = bridge();
    if (!el || !menu || !api || !api.menuSize) return;
    const r = el.getBoundingClientRect();
    api.menuSize(Math.ceil(r.width), Math.ceil(r.height), menu.seq);
  }, [menu]);

  const close = useCallback(() => { const api = bridge(); if (api && api.closeMenuPopup) api.closeMenuPopup(); }, []);
  const pick = useCallback((id, keep = false) => { const api = bridge(); if (api && api.menuPick) api.menuPick(id, seqRef.current, keep); }, []);

  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [close]);

  if (!menu) return null;
  return (
    // `popup`: the same menu, but laid out for a window of its own — it sizes the window instead of
    // being positioned inside one, so no fixed position, no clamping and no column folding.
    <div className="ctx-menu popup" ref={ref} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) => (it.sep
        ? <div className="ctx-sep" key={`sep${i}`} />
        : (
          <button key={it.id} className={`ctx-item ${it.checked ? 'checked' : ''}`} role="menuitem" disabled={it.disabled}
            onClick={() => { if (!it.disabled) pick(it.id); }}>
            <span className="ctx-icon">{it.icon ? <Icon name={it.icon} size={14} /> : it.checked ? <Icon name="check" size={14} /> : null}</span>
            {it.swatch && <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${it.swatchBg} 50%, ${it.swatch} 50%)` }} />}
            <span className="ctx-label">{it.label}</span>
            {it.icon && it.checked && <Icon name="check" size={14} className="ctx-check" />}
            {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
            {it.remove && <span className="ctx-remove" role="button" title={it.removeTitle} onClick={(e) => { e.stopPropagation(); pick(it.remove, true); }}><Icon name="close" size={12} /></span>}
          </button>
        )))}
    </div>
  );
}

export default MenuPopup;

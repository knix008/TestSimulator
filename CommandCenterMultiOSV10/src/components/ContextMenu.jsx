// Positioned popup menu used for the panel context menu and the menu-bar
// dropdowns. Closes on outside click, Escape, or when an item is picked.
//
// No item is ever cut off, whatever the size of the window:
//   • Desktop — the menu is drawn in a frameless window of its own
//     (src/MenuPopup.jsx), so a long menu extends past the app window's edge
//     the way an OS menu does. Nothing is drawn in the page at all then.
//   • Web — a browser page cannot draw outside its viewport, so a menu taller
//     than the window wraps into as many columns as it takes (the CSS class
//     `multi` turns the list into a wrapping flex column and `height` is the
//     column height). The columns are balanced first, then the height is
//     nudged up until the items really fit in that many columns — an item
//     cannot be split, so the balanced height alone can come up one short.
// Either way there is no scrollbar.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { menuPopup } from '../lib/backend';

const MARGIN = 8;   // kept free between the menu and the window edge
const POPUP_TIMEOUT_MS = 500;   // the popup window has this long to report itself on screen, else the menu is drawn here

// The items as the popup window needs them: plain data, no React (it draws them itself).
const plainItems = (items) => items.map((it) => (it.sep
  ? { sep: true }
  : { id: it.id, label: it.label, icon: it.icon, shortcut: it.shortcut, checked: !!it.checked, disabled: !!it.disabled, swatch: it.swatch, swatchBg: it.swatchBg }));

export function ContextMenu({ x, y, items, onPick, onClose, anchorEl }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, height: undefined, multi: false });
  // Handed to the popup window when there is one; only then is nothing drawn here.
  const [inPopup, setInPopup] = useState(() => !!menuPopup);
  const cb = useRef({ onPick, onClose });
  cb.current = { onPick, onClose };

  // ── Desktop: the menu goes to its own window ──
  // The pick / closed subscription lasts as long as the menu is open …
  const liveRef = useRef(true);
  const seqRef = useRef(null);   // the menu this component last put on screen
  const shownRef = useRef(false);
  // Set when this component is done with the popup. A close always names the menu it means (below); until
  // `show` has answered with one, the close waits for it — an unnamed close would hide whatever menu is on
  // screen by then, which is exactly what happens in development, where effects run twice.
  const doneRef = useRef(false);
  useEffect(() => {
    if (!menuPopup) return undefined;
    liveRef.current = true;
    doneRef.current = false;
    const offShown = menuPopup.onShown(() => { shownRef.current = true; });
    const offPicked = menuPopup.onPicked(({ id }) => { if (!liveRef.current) return; liveRef.current = false; cb.current.onPick(id); });
    const offClosed = menuPopup.onClosed(() => { if (!liveRef.current) return; liveRef.current = false; cb.current.onClose(); });
    // A popup that never reports itself on screen is no use: draw the menu in this window instead, so a
    // menu always appears even if the popup window cannot be shown on this system.
    const giveUp = setTimeout(() => { if (liveRef.current && !shownRef.current) setInPopup(false); }, POPUP_TIMEOUT_MS);
    return () => {
      clearTimeout(giveUp);
      liveRef.current = false; doneRef.current = true;
      offShown(); offPicked(); offClosed();
      if (seqRef.current !== null) menuPopup.close(seqRef.current);   // else the pending show closes it when it answers
    };
  }, []);

  // … while the items are (re)sent whenever they change: the menu bar keeps one ContextMenu mounted and
  // swaps its items as the pointer moves from one title to the next, so the popup has to follow.
  const itemsKey = JSON.stringify(plainItems(items));
  useEffect(() => {
    if (!menuPopup) return;
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : null;
    const anchor = rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : { x, y, w: 0, h: 0 };
    menuPopup.show({ items: JSON.parse(itemsKey), anchor })
      .then((seq) => {
        if (seq === null) { if (liveRef.current) setInPopup(false); return; }   // no popup after all — draw it in the page
        seqRef.current = seq;
        if (doneRef.current) menuPopup.close(seq);   // closed while this show was in flight
      })
      .catch(() => { if (liveRef.current) setInPopup(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, anchorEl, x, y]);

  // The popup deliberately does not take the focus, so this window is the one that hears the user: a click
  // anywhere outside the anchor, or Escape, closes the menu. Window `blur` is NOT a close reason here —
  // clicking a menu item focuses the popup and would otherwise close the menu before the pick arrives.
  useEffect(() => {
    if (!inPopup) return undefined;
    const down = (e) => { if (anchorEl && anchorEl.contains(e.target)) return; cb.current.onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cb.current.onClose(); } };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [inPopup, anchorEl]);

  const layout = useCallback(() => {
    const el = ref.current;
    if (!el || inPopup) return;
    const availH = window.innerHeight - MARGIN * 2;
    // Measure as a single column, undoing what an earlier pass may have left behind.
    el.classList.remove('multi');
    el.style.height = '';
    const natural = el.offsetHeight;
    let cols = natural > availH ? Math.ceil(natural / availH) : 1;
    let height;
    if (cols > 1) {
      el.classList.add('multi');
      const columnsNow = () => new Set(Array.from(el.children).map((c) => c.offsetLeft)).size;
      height = Math.min(availH, Math.ceil(natural / cols));
      el.style.height = `${height}px`;
      for (let guard = 0; guard < 60 && height < availH && columnsNow() > cols; guard++) {
        height = Math.min(availH, height + 16);
        el.style.height = `${height}px`;
      }
      cols = columnsNow();
    }
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = x, top = y;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.left; top = r.bottom + 2;
    }
    if (left + w > window.innerWidth - MARGIN) left = Math.max(MARGIN, window.innerWidth - w - MARGIN);
    if (top + h > window.innerHeight - MARGIN) top = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    const next = { left, top, height, multi: cols > 1 };
    setPos((p) => (p.left === next.left && p.top === next.top && p.height === next.height && p.multi === next.multi ? p : next));
  }, [x, y, anchorEl, inPopup]);

  useLayoutEffect(layout, [layout, items.length]);
  // A menu open while the window is resized re-wraps, so nothing is ever cut off.
  useEffect(() => {
    window.addEventListener('resize', layout);
    return () => window.removeEventListener('resize', layout);
  }, [layout]);

  useEffect(() => {
    if (inPopup) return undefined;   // the popup window closes itself (Escape, losing the focus)
    const down = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (anchorEl && anchorEl.contains(e.target)) return;
      onClose();
    };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, anchorEl, inPopup]);

  if (inPopup) return null;   // the menu lives in its own window
  return (
    <div className={`ctx-menu ${pos.multi ? 'multi' : ''}`} ref={ref} style={{ left: pos.left, top: pos.top, height: pos.height }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it.sep
        ? <div className="ctx-sep" key={`sep${i}`} />
        : (
          <button key={it.id} className={`ctx-item ${it.checked ? 'checked' : ''}`} role="menuitem" disabled={it.disabled}
            onClick={() => { if (!it.disabled) onPick(it.id); }}>
            {/* the item's icon stays; a checked item gets a check mark on the right (an item without an icon shows the check in the icon slot) */}
            <span className="ctx-icon">{it.icon ? <Icon name={it.icon} size={14} /> : it.checked ? <Icon name="check" size={14} /> : null}</span>
            {it.swatch && <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${it.swatchBg} 50%, ${it.swatch} 50%)` }} />}
            <span className="ctx-label">{it.label}</span>
            {it.icon && it.checked && <Icon name="check" size={14} className="ctx-check" />}
            {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
          </button>
        ))}
    </div>
  );
}

export default ContextMenu;

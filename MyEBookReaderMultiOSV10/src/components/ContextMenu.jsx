import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MenuList from './MenuList.jsx';
import { clampPopupPos } from '../lib/view.js';

// The in-page menu.
//
// In the desktop app every menu opens as its own window (see MenuHost), which is
// what lets a long list overhang the frame. The web build has no second window,
// so the same rows are drawn here instead, positioned at the anchor and clamped
// inside the viewport.
export default function ContextMenu({ open, x, y, rows, label, onChoose, onClose }) {
  const ref = useRef(null);
  const { t } = useTranslation();
  const [pos, setPos] = useState({ x, y });
  const [columns, setColumns] = useState(1);

  // Measure after layout and pin the menu inside the window. A later effect
  // must not write the raw click point back — that is what put a menu under the
  // window edge.
  useEffect(() => { if (!open) setColumns(1); }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    // Too tall for the viewport: deal the rows into another column instead of
    // running off the bottom.
    if (el && el.offsetHeight > window.innerHeight - 24 && columns < 4) {
      setColumns(columns + 1);
      return;
    }
    setPos(clampPopupPos({
      x,
      y,
      width: el?.offsetWidth || 240,
      height: el?.offsetHeight || 0,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    }));
  }, [open, x, y, rows, columns]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Capture: a bubble listener misses clicks that stop propagation.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={columns > 1 ? 'ctxmenu menu-window wide' : 'ctxmenu menu-window'}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // Keep the text selection: a default mousedown here collapses it and
        // Copy would then read an empty range.
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList
        rows={rows || []}
        columns={columns}
        label={label || 'menu'}
        translate={(key, args) => t(key, args)}
        onChoose={(id) => { onChoose(id); onClose(); }}
      />
    </div>
  );
}

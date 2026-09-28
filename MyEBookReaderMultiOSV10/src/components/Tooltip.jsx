import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Global fast tooltip. Any element with a `title` attribute is shown through a
// custom tooltip with a short delay (native title tooltips are ~1s and can't be
// sped up). On first hover the element's `title` is moved to `data-tip` so the
// browser's slow native tooltip never fires.
const DELAY = 220;

export default function Tooltip() {
  const [tip, setTip] = useState(null); // { text, rect }
  const ref = useRef(null);

  useEffect(() => {
    let timer = null;
    let current = null;

    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const hide = () => { clear(); current = null; setTip(null); };

    const onOver = (e) => {
      const el = e.target.closest?.('[title],[data-tip]');
      if (!el) return;
      if (el.hasAttribute('title')) {
        const txt = el.getAttribute('title');
        if (txt) el.setAttribute('data-tip', txt);
        el.removeAttribute('title'); // suppress native tooltip
      }
      const text = el.getAttribute('data-tip');
      if (!text || el === current) return;
      current = el;
      clear();
      timer = setTimeout(() => {
        if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, DELAY);
    };

    const onOut = (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el && el === current) hide();
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('mousedown', hide, true);
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      clear();
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('mousedown', hide, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  const [pos, setPos] = useState({ left: 0, top: 0, above: false });
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const r = tip.rect;
    const tt = ref.current.getBoundingClientRect();
    const above = r.bottom + 8 + tt.height > window.innerHeight;
    let left = r.left + r.width / 2 - tt.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tt.width - 6));
    const top = above ? r.top - tt.height - 8 : r.bottom + 8;
    setPos({ left, top, above });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={ref} className="tooltip" style={{ left: pos.left, top: pos.top }} role="tooltip">
      {tip.text}
    </div>
  );
}

// Term tooltips: one host for the whole window. An element with
// data-term="<key>" (lib/terms.js) — or data-tip-title / data-tip-text for
// texts that come from the server (HIS metrics) — shows a card with the term's
// name and explanation on hover (after a short delay) or keyboard focus.
import React, { useEffect, useRef, useState } from 'react';
import { getLanguage, useLanguage } from '../lib/i18n';
import { termOf } from '../lib/terms';

function contentOf(el) {
  if (el.dataset.tipText) return [el.dataset.tipTitle || '', el.dataset.tipText];
  return termOf(el.dataset.term, getLanguage());
}

export function TermTip() {
  useLanguage();
  const [tip, setTip] = useState(null); // { title, text, x, y, below }
  const timer = useRef(null);
  const current = useRef(null);
  useEffect(() => {
    const hide = () => { clearTimeout(timer.current); current.current = null; setTip(null); };
    const show = (el, delay) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const c = contentOf(el);
        if (!c || !document.body.contains(el)) return;
        const r = el.getBoundingClientRect();
        const below = r.bottom + 160 < window.innerHeight;
        setTip({ title: c[0], text: c[1], x: Math.min(Math.max(8, r.left), window.innerWidth - 348), y: below ? r.bottom + 6 : r.top - 6, below });
      }, delay);
    };
    const target = (e) => (e.target && e.target.closest ? e.target.closest('[data-term], [data-tip-text]') : null);
    const over = (e) => {
      const el = target(e);
      if (el === current.current) return;
      current.current = el;
      if (el) show(el, 350); else hide();
    };
    const focus = (e) => { const el = target(e); if (el) { current.current = el; show(el, 0); } };
    const key = (e) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (!tip) return null;
  return (
    <div className={`term-tip ${tip.below ? 'below' : 'above'}`} role="tooltip" data-testid="term-tip"
      style={{ left: tip.x, top: tip.y, transform: tip.below ? 'none' : 'translateY(-100%)' }}>
      {tip.title && <strong>{tip.title}</strong>}
      <span>{tip.text}</span>
    </div>
  );
}

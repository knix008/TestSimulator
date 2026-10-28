// Term tooltips: one host for the whole window. An element with
// data-term="<key>" (lib/terms.js) — or data-tip-title / data-tip-text for
// texts that come from the server (HIS metrics) — shows a card with the term's
// name and explanation on hover (after a short delay) or keyboard focus.
// Abbreviations in the text under the pointer (lib/abbrev.js: LP64, CWE …)
// are spelled out on the card too, or on a card of their own.
import React, { useEffect, useRef, useState } from 'react';
import { getLanguage, useLanguage, keysOfText } from '../lib/i18n';
import { termOf } from '../lib/terms';
import { helpOf } from '../lib/help';
import { abbreviationsIn, explainAbbreviations } from '../lib/abbrev';

// Controls and labels whose visible text names a help entry (lib/help.js).
const CONTROLS = 'button, [role="tab"], [role="menuitem"], a[href], summary, label, th, .st-label, .nav-item, .menu-item, .type-tab, .k, .tb-label';

// Candidate label texts of a control: its lines, without counts ("이슈 416").
function labelsOf(el) {
  const out = [];
  for (const line of String(el.innerText || el.textContent || '').split(/\n+/)) {
    const s = line.replace(/\s+/g, ' ').trim();
    if (!s || s.length > 60) continue;
    out.push(s, s.replace(/\s*[\d,.%]+\+?$/, '').trim(), s.replace(/[…:]+$/, '').trim());
  }
  return out.filter(Boolean);
}

// The element's own short text (a label, a cell, an option), for abbreviations.
function shortText(el) {
  const s = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  return s.length <= 200 ? s : '';
}

function contentOf(el) {
  const c = baseContentOf(el);
  const lang = getLanguage();
  const abbr = explainAbbreviations(`${shortText(el)} ${(c && c[0]) || ''}`, lang);
  if (!abbr) return c;
  if (!c) return [abbreviationsIn(shortText(el)).join(' · '), abbr];
  return c[1].includes(abbr) ? c : [c[0], `${c[1]}\n\n${abbr}`];
}

function baseContentOf(el) {
  if (el.dataset.tipText) return [el.dataset.tipTitle || '', el.dataset.tipText];
  if (el.dataset.term) return termOf(el.dataset.term, getLanguage());
  const lang = getLanguage();
  for (const text of labelsOf(el)) {
    for (const key of keysOfText(text, lang)) {
      const h = helpOf(key, lang);
      if (h) return [text, h];
    }
  }
  // No entry: the control's own short tip (its title), shown the same way.
  const title = el.dataset.savedTitle || el.getAttribute('title');
  if (title) { const label = labelsOf(el)[0] || ''; return label && label !== title ? [label, title] : ['', title]; }
  return null;
}

/** The element a pointer or focus target explains: a term first, else a control or label with help or a title. */
function targetOf(node) {
  if (!node || !node.closest) return null;
  const term = node.closest('[data-term], [data-tip-text]');
  if (term && (term.dataset.term || term.dataset.tipText)) return term;
  if (node.closest('.term-tip')) return null;
  const ctl = node.closest(CONTROLS);
  if (ctl) {
    // A header or card around a single term explains that term.
    const inner = ctl.querySelectorAll('[data-term]:not([data-term=""]), [data-tip-text]');
    if (inner.length === 1) return inner[0];
    if (contentOf(ctl)) return ctl;
  }
  // Plain text with an abbreviation in it (a cell, a hint, a value): the
  // nearest short element around the pointer.
  let el = node.nodeType === 1 ? node : node.parentElement;
  for (let up = 0; el && up < 3 && el !== document.body; up++, el = el.parentElement) {
    const text = shortText(el);
    if (!text) break;
    if (abbreviationsIn(text).length) return el;
  }
  return null;
}

export function TermTip() {
  useLanguage();
  const [tip, setTip] = useState(null); // { title, text, x, y, below }
  const timer = useRef(null);
  const current = useRef(null);
  // For checks (e2e): what a control would show.
  useEffect(() => { window.__mccHelp = { targetOf, contentOf }; }, []);
  useEffect(() => {
    // The browser's own title tooltip would show as well: it is set aside while ours shows.
    const restore = (el) => { if (el && el.dataset.savedTitle != null) { el.setAttribute('title', el.dataset.savedTitle); delete el.dataset.savedTitle; } };
    const hide = () => { clearTimeout(timer.current); restore(current.current); current.current = null; setTip(null); };
    const show = (el, delay) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const c = contentOf(el);
        if (!c || !document.body.contains(el)) return;
        if (el.hasAttribute('title')) { el.dataset.savedTitle = el.getAttribute('title'); el.removeAttribute('title'); }
        const r = el.getBoundingClientRect();
        const below = r.bottom + 160 < window.innerHeight;
        setTip({ title: c[0], text: c[1], x: Math.min(Math.max(8, r.left), window.innerWidth - 348), y: below ? r.bottom + 6 : r.top - 6, below });
      }, delay);
    };
    const target = (e) => targetOf(e.target);
    const over = (e) => {
      const el = target(e);
      if (el === current.current) return;
      restore(current.current);
      setTip(null);
      current.current = el;
      if (el) show(el, 450); else clearTimeout(timer.current);
    };
    const focus = (e) => { const el = target(e); if (el) { restore(current.current); current.current = el; show(el, 600); } };
    const down = () => hide();
    const key = (e) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('mouseover', over);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mousedown', down, true);
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

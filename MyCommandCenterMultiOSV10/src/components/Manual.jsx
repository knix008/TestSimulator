// The illustrated manual (doc/index.html). The same page opens in a browser
// at /doc/. In the app it is its own window (Info › Guide, F1, the start
// screen); with separate windows turned off it fills the main window instead.
// Either way the page is drawn in the app's theme and language.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t, getLanguage, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

// The manual's colour variables, each taken from the app theme token beside it.
const THEME_VARS = {
  '--paper': '--bg', '--field': '--bg', '--card': '--bg-panel', '--head': '--bg-elev',
  '--ink': '--fg', '--muted': '--fg-muted', '--line': '--border', '--accent': '--accent', '--on-accent': '--accent-text',
};

export function manualTheme() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const vars = {};
  for (const [doc, app] of Object.entries(THEME_VARS)) vars[doc] = style.getPropertyValue(app).trim();
  return { type: 'cc-manual-theme', mode: root.dataset.mode === 'light' ? 'light' : 'dark', vars, lang: getLanguage() === 'en' ? 'en' : 'ko' };
}

/** The manual page, kept in the current theme and language. Esc inside it calls onClose. */
export function ManualFrame({ onClose, onPrint }) {
  const lang = useLanguage();
  const cb = useRef(onPrint);
  cb.current = onPrint;
  const frame = useRef(null);
  const [shown, setShown] = useState(false);
  const send = useCallback(() => {
    try { frame.current?.contentWindow?.postMessage(manualTheme(), '*'); } catch { /* not loaded yet */ }
  }, []);

  useEffect(() => { send(); }, [lang, send]);
  useEffect(() => {
    // A theme change rewrites the custom properties on <html> (themes.js applyTheme).
    const watch = new MutationObserver(send);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode', 'style'] });
    const onMsg = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow || !e.data) return;
      if (e.data.type === 'cc-manual-ready') {
        send();
        // The page applies the message on its next task; show it the frame after.
        requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      }
      if (e.data.type === 'cc-manual-close' && onClose) onClose();
      if (e.data.type === 'cc-manual-print' && cb.current) cb.current(e.data.lang === 'en' ? 'en' : 'ko');
    };
    window.addEventListener('message', onMsg);
    return () => { watch.disconnect(); window.removeEventListener('message', onMsg); };
  }, [send, onClose]);

  // The language only seeds the first paint; later changes arrive with the theme message.
  const src = useRef(`./doc/index.html?lang=${lang === 'en' ? 'en' : 'ko'}`).current;
  // A page that never says it is ready (an older copy of the manual) is shown anyway.
  const onLoad = () => { send(); setTimeout(() => setShown(true), 400); };
  return <iframe ref={frame} className={`manual-frame${shown ? '' : ' is-pending'}`} title={t('manual_title')} src={src} onLoad={onLoad} />;
}

/**
 * The guide's print window: the guide as it goes on paper (doc/index.html?print=1 — the content only,
 * black on white, no header and no side panel) under a bar with Print and Close. Print opens the
 * system print dialog for that page. As a separate window (Guide › Print) it fills the window; with
 * separate windows turned off it covers the main window like the guide itself.
 */
export function ManualPrint({ onClose, lang: langArg, windowed = false }) {
  const appLang = useLanguage();
  const lang = langArg === 'en' || langArg === 'ko' ? langArg : (appLang === 'en' ? 'en' : 'ko');
  const frame = useRef(null);
  const [ready, setReady] = useState(false);
  const src = useRef(`./doc/index.html?print=1&lang=${lang}`).current;
  useEffect(() => { if (windowed) document.title = t('manual_print_title'); }, [windowed]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); print(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  // The page prints itself, so the dialog shows that page (not this bar).
  const print = () => {
    const w = frame.current && frame.current.contentWindow;
    if (!w) return;
    try { w.focus(); w.print(); } catch { w.postMessage({ type: 'cc-manual-do-print' }, '*'); }
  };
  return (
    <div className={`manual-layer manual-print${windowed ? ' windowed' : ''}`} role="dialog" aria-label={t('manual_print_title')}>
      <div className="manual-bar">
        <b className="manual-title"><Icon name="print" size={16} />{t('manual_print_title')}</b>
        <span className="manual-print-note">{t('manual_print_note')}</span>
        <span className="manual-bar-btns">
          <button type="button" className="btn primary" disabled={!ready} onClick={print}><Icon name="print" size={14} /> {t('pr_print')}</button>
          <button type="button" className="btn" onClick={onClose}><Icon name="close" size={14} /> {t('close')}</button>
        </span>
      </div>
      <iframe ref={frame} className="manual-frame manual-print-frame" title={t('manual_print_title')} src={src} onLoad={() => setReady(true)} />
    </div>
  );
}

/** In-window fallback when tools do not open as separate windows. */
export function Manual({ onClose, onPrint }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="manual-layer" role="dialog" aria-label={t('manual_title')}>
      <div className="manual-bar">
        <b className="manual-title"><Icon name="book" size={16} />{t('manual_title')}</b>
        <button type="button" className="btn" onClick={onClose}><Icon name="close" size={14} /> {t('close')}</button>
      </div>
      <ManualFrame onClose={onClose} onPrint={onPrint} />
    </div>
  );
}

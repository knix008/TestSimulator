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
export function ManualFrame({ onClose }) {
  const lang = useLanguage();
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
    };
    window.addEventListener('message', onMsg);
    return () => { watch.disconnect(); window.removeEventListener('message', onMsg); };
  }, [send, onClose]);

  // The language only seeds the first paint; later changes arrive with the theme message.
  const src = useRef(`./doc/index.html?lang=${lang === 'en' ? 'en' : 'ko'}`).current;
  // A page that never says it is ready (an older copy of the manual) is shown anyway.
  const onLoad = () => { send(); setTimeout(() => setShown(true), 400); };
  return <iframe ref={frame} className={`manual-frame${shown ? '' : ' is-pending'}`} title={t('start_manual')} src={src} onLoad={onLoad} />;
}

/** In-window fallback when tools do not open as separate windows. */
export function Manual({ onClose }) {
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
    <div className="manual-layer" role="dialog" aria-label={t('start_manual')}>
      <div className="manual-bar">
        <b className="manual-title"><Icon name="book" size={16} />{t('start_manual')}</b>
        <button type="button" className="btn" onClick={onClose}>{t('close')}</button>
      </div>
      <ManualFrame onClose={onClose} />
    </div>
  );
}

// The illustrated manual (doc/index.html). The same page opens in a browser
// at /doc/. Here it fills the window so the start screen can search it.
import React, { useEffect } from 'react';
import { t } from '../lib/i18n';
import { Icon } from './Icons';

export function Manual({ lang, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const onMsg = (e) => {
      if (e.data && e.data.type === 'cc-manual-close') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('message', onMsg);
    };
  }, [onClose]);

  const src = `./doc/index.html?lang=${lang === 'en' ? 'en' : 'ko'}`;
  return (
    <div className="manual-layer" role="dialog" aria-label={t('start_manual')}>
      <div className="manual-bar">
        <b className="manual-title"><Icon name="book" size={16} />{t('start_manual')}</b>
        <button type="button" className="btn" onClick={onClose}>{t('close')}</button>
      </div>
      <iframe className="manual-frame" title={t('start_manual')} src={src} />
    </div>
  );
}
